const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');;
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fikwith.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// const verifyJWT = (req, res, next)=>{
//   const authHeader = req.headers.authorization;
//   if(!authHeader){
//     return res.status(401).send('unauthorized access');
//   }

//   const token = authHeader.split(' ')[1];

//   jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
//     if(err){
//       return res.status(403).send({message: 'Forbidden Access'})
//     }
//     res.decoded = decoded;
//     next();
//   })
// }

const verifyJwt = (req, res, next)=>{
  
  const authHeader = req.headers.authorization;
  if(!authHeader){
        return res.status(401).send('unauthorized access');
      }

      const token = authHeader.split(' ')[1];

      jwt.verify(token, process.env.ACCESS_TOKEN, function(error, decoded){
            if(error){
              return res.status(403).send({message: 'Forbidden Access'})
            }
            res.decoded = decoded;
            next();
          })
}


async function run() {
  try {
    
    await client.connect();
    
    const appOptionCollection = client.db('DoctorPortalDB').collection('appointmentOptions');
    const bookingCollection = client.db('DoctorPortalDB').collection('bookings');
    const usersCollection = client.db('DoctorPortalDB').collection('users');

  app.get('/jwt', async(req, res)=>{
    const email = req.query.email;
    const query = {email: email}
    const user = await usersCollection.findOne(query);
    if(user){
      const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
      return res.send({accessToken : token})
    }
    res.status(403).send({accessToken: ''})
  })

    // Booking Related Api and minimum one slot book per a day
    app.post('/bookings', async(req, res) =>{
      const booking = req.body;
      const query ={
        selectedDate: booking.selectedDate,
        email:booking.email,
        treatment: booking.treatment
      }
      const alreadyBooked = await bookingCollection.find(query).toArray();

      if(alreadyBooked.length){
        const message = `You Already Have a Booking on ${booking.selectedDate}`
        return res.send({acknowledged: false, message})
      }

      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    // get booking as current users login .
    app.get('/bookings', verifyJwt,  async(req, res)=>{
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if(email !== decodedEmail){
        return res.status(403).send({message:'Forbidden Access'})
      }
      const query = {email: email};
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    })


    //Use Aggregate to Query multiple Appointment collection  and then merge Data Related Api
    app.get('/appointmentOptions', async(req, res)=>{
       const date = req.query.date;
      //  console.log('date', date)
       
        const options = await appOptionCollection.find().toArray();
        // get the booking of the provided date
        const bookingQuery = {selectedDate: date}
        const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
        // code carefully: D
        options.forEach(option =>{
          const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
         const bookedSlots = optionBooked.map(book => book.slot);
          
        //  Remaining Slots 
         const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
         option.slots = remainingSlots;

        //  console.log(date, option.name, remainingSlots.length)
        })

        res.send(options);
    })


     // User related all Api
    app.post('/users', async(req, res)=>{
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users', async(req, res)=>{
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users)
    })
    // Get A User role of Admin
    app.get('/users/admin/:email', async(req, res)=>{
      const email = req.params.email;
      const query ={email: email};
      const user = await usersCollection.findOne(query);
      res.send({isAdmin: user?.role === 'admin'});

    })

    // Make a user Admin
    app.put('/users/admin/:id', verifyJwt, async(req, res)=>{

      const decodedEmail = req.decoded.email;
      const query ={email: decodedEmail};
      const user =await usersCollection.findOne(query);

      if(user?.role !=='admin'){
        return res.status(403).send({message: 'forbidden Access'})
      }

      const id = req.params.id;
      const filter = {_id : new ObjectId(id)};
      const options = {upsert: true}
      const updatedDoc ={
        $set:{
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc, options);
      res.send(result)
    })


  } finally {
   
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Doctor Portal Server is Running!')
})

app.listen(port, () => {
  console.log(`Doctor Portal Server is Running on port ${port}`)
})