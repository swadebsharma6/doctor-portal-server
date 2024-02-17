const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
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

async function run() {
  try {
    
    await client.connect();
    
    const appOptionCollection = client.db('DoctorPortalDB').collection('appointmentOptions');
    const bookingCollection = client.db('DoctorPortalDB').collection('bookings');

    // Booking Related Api
    app.post('/bookings', async(req, res) =>{
      const booking = req.body;
      // console.log(booking)
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

    app.get('/bookings', async(req, res) =>{
      const query ={};
      const cursor = bookingCollection.find(query);
      const result = await cursor.toArray();
      res.send(result)
    })


    //Use Aggregate to Query multiple Appointment collection  and then merge Data Related Api
    app.get('/appointmentOptions', async(req, res)=>{
      const date = req.query.date;
       
        const options = await appOptionCollection.find().toArray();
        // get the booking of the provided date
        const bookingQuery = {selectedDate: date}
        const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
        // code carefully: D
        options.forEach(option =>{
          const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
         const bookedSlots = optionBooked.map(book => book.slot);

         const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
         option.slots = remainingSlots;

        //  console.log(date, option.name, remainingSlots.length)
        })

        res.send(options);
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Doctor Portal Server is Running!')
})

app.listen(port, () => {
  console.log(`Doctor Portal Server is Running on port ${port}`)
})