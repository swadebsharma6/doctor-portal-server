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



// MiddleWare for Verify Token

const verifyJwt = (req, res, next)=>{
  // console.log('Token inside Jwt',req.headers.authorization)
  const authHeader = req.headers.authorization;
  if(!authHeader){
        return res.status(401).send('unauthorized Access');
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
    const doctorCollection = client.db('DoctorPortalDB').collection('doctors');

  app.get('/jwt', async(req, res)=>{
    const email = req.query.email;
    const query = {email: email}
    const user = await usersCollection.findOne(query);
    if(user){
      const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '2h'})
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

    // get all booking as current users login .
    app.get('/bookings', verifyJwt,  async(req, res)=>{
      // console.log('Token',req.headers.authorization)
      const email = req.query.email;
      const decodedEmail = req.decoded?.email;
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
        //  console.log('Booked slots you selected :',bookedSlots)
          
        //  Remaining Slots 
         const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
         option.slots = remainingSlots;

        //  console.log(date, option.name, remainingSlots.length)
        })

        res.send(options);
    })


    app.get('/appointmentSpecialty', async(req, res)=>{
      const query ={};
      const result = await appOptionCollection.find(query).project({name: 1}).toArray();
      res.send(result)
    })

    // app.get('/v2/appointmentOptions', async(req,res)=>{
    //   const date = req.query.date;
    //   const options = await appOptionCollection.aggregate([
    //     {
    //       $lookup:
    //         {
    //           from: 'bookings',
    //           localField: 'name',
    //           foreignField: 'treatment',
    //           pipeline: [ 
    //             {
    //               $match:{
    //                 $expr:{
    //                   $eq: ['$selectedDate', date]
    //                 }
    //               }
    //             }
    //           ],
    //           as: 'booked'
    //         }
    //    },
    //    {
    //       $project:{
    //         name: 1,
    //         slots: 1,
    //         booked:{
    //           $map:{
    //             input: '$booked',
    //             as: 'book',
    //             in: '$$book.slot'
    //           }
    //         }
    //       }
    //    },
    //    {
    //       $project:{
    //         name: 1,
    //         slots: {
    //           $setDifference: ['$slots', '$booked']
    //         }
    //       }
    //    }
    //   ]).toArray();

    //   res.send(options);
    // })


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
      const query ={ email: email};
      const user = await usersCollection.findOne(query);
      res.send({isAdmin: user?.role === 'admin'});

    })

    // Make a user Admin
    app.put('/users/admin/:id', verifyJwt, async(req, res)=>{

      const decodedEmail = req.decoded?.email;
      const query ={email: decodedEmail};
      const user = await usersCollection.findOne(query);

      if(user?.role !== 'admin'){
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
    });


    // Doctors collection related Api
    app.post('/doctors', async(req, res)=>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result)
    })

    app.get('/doctors', async(req, res)=>{
      const query ={}
      const result = await doctorCollection.find(query).toArray();
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