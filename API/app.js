require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());

// Configure database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.post('/api/rides/request', async (req, res) => {
    const { rider_id, pickup_location, dropoff_location } = req.body;
  
    try {
      const result = await pool.query(
        `INSERT INTO Ride (pickup_location, dropoff_location) 
         VALUES ($1, $2) RETURNING ride_id`,
        [pickup_location, dropoff_location]
      );
  
      const ride_id = result.rows[0].ride_id;
  
      await pool.query(
        `INSERT INTO RiderRide (rider_id, ride_id) VALUES ($1, $2)`,
        [rider_id, ride_id]
      );
  
      res.status(201).json({ message: 'Ride requested successfully', ride_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  
  app.post('/api/rides/accept', async (req, res) => {
    const { ride_id, driver_id, vehicle_id } = req.body; // Accept vehicle_id explicitly
  
    try {
      // validating the ride exists
      const rideResult = await pool.query(
        `SELECT * FROM Ride WHERE ride_id = $1 FOR UPDATE`,
        [ride_id]
      );
  
      if (!rideResult.rows.length) {
        return res.status(404).json({ error: 'Ride not found' });
      }
  
      // Validating that the driver and vehicle
      const driverVehicleResult = await pool.query(
        `SELECT * FROM DriverVehicle WHERE driver_id = $1 AND vehicle_id = $2`,
        [driver_id, vehicle_id]
      );
  
      if (!driverVehicleResult.rows.length) {
        return res.status(400).json({ error: 'Invalid driver and vehicle mapping' });
      }
  
      // assigning the driver and vehicle to the ride
      await pool.query(
        `UPDATE Ride 
         SET start_time = NOW() 
         WHERE ride_id = $1`,
        [ride_id]
      );
  
      res.status(200).json({ message: 'Ride accepted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/rides/:ride_id', async (req, res) => {
    const { ride_id } = req.params;
  
    try {
      const result = await pool.query(
        `Select r.rider_id, r.name as rider_name, rd.ride_id, rd.start_time, rd.end_time, rd.pickup_location, rd.dropoff_location, d.name as driver_name, v.make AS vehicle_make, v.model as vehicle_model, p.amount as payment_amount, p.status as payment_status, rt.rider_rating, rt.driver_rating, rt.comments as ride_comments
        from Rider r
        join RiderRide rr on r.rider_id = rr.rider_id
        join Ride rd on rr.ride_id = rd.ride_id
        join DriverVehicle dv on rd.ride_id = dv.driver_id
        join Driver d on dv.driver_id = d.driver_id
        join Vehicle v on dv.vehicle_id = v.vehicle_id
        left join RidePayment rp on rd.ride_id = rp.ride_id
        left join Payment p on rp.payment_id = p.payment_id
        left join Rating rt on rd.ride_id = rt.ride_id
        where r.rider_id = $1`,
        [ride_id]
      );
  
      if (!result.rows.length) {
        res.status(404).json({ error: 'Ride not found' });
      } else {
        res.status(200).json(result.rows[0]);
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/rides/complete', async (req, res) => {
    const { ride_id } = req.body;
  
    try {
      await pool.query('BEGIN'); // Start transaction
  
      const paymentStatus = Math.random() > 0.5 ? 'Success' : 'Failure';
      const amount = (Math.random() * 50 + 10).toFixed(2);
  
      await pool.query(
        `INSERT INTO Payment (amount, status, payment_date) 
         VALUES ($1, $2, NOW()) RETURNING payment_id`,
        [amount, paymentStatus]
      );
  
      await pool.query(
        `UPDATE Ride SET end_time = NOW() WHERE ride_id = $1`,
        [ride_id]
      );
  
      await pool.query('COMMIT'); // Commit transaction
      res.status(200).json({ message: 'Ride completed successfully', paymentStatus });
    } catch (error) {
      await pool.query('ROLLBACK'); // Rollback transaction on error
      res.status(500).json({ error: error.message });
    }
  });
  

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
