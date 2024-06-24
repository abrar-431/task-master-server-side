const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://task-master-3ed55.web.app"
    ]
  })
);
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.salgcrv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const featuresCollection = client.db("TaskMaster").collection('features');
    const reviewsCollection = client.db("TaskMaster").collection('reviews');
    const userCollection = client.db("TaskMaster").collection('users');
    const taskCollection = client.db("TaskMaster").collection('tasks');
    const notificationCollection = client.db("TaskMaster").collection('notifications');
    const submissionCollection = client.db("TaskMaster").collection('submissions');

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized' });
        }
        req.decoded = decoded;
        next();
      })
    }
    // Verify user
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'Admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    }
    const verifyTaskCreator = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'Task Creator';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    }
    const verifyWorker = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'Worker';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    }

    // Features related api
    app.get('/features', async (req, res) => {
      const result = await featuresCollection.find().toArray();
      res.send(result);
    })
    // Reviews related api
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    })

    // Users related api
    app.get('/coin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const options = {
        projection: { _id: 0, coin: 1 }
      };
      const result = await userCollection.findOne(query, options);
      res.send(result);
    })
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const options = {
        projection: { _id: 0, role: 1 }
      }
      const result = await userCollection.findOne(query, options);
      res.send(result);
    })
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      const welcomeNotification = {
        to_email: user.email,
        current_time: new Date().toISOString(),
        message: `Welcome ${user.name}!`
      };
      await notificationCollection.insertOne(welcomeNotification);
      res.send(result);
    })
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const user = req.body;
      const updatedUser = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedUser);
      res.send(result);
    })
    // Decrease User Coin by email
    app.patch('/coin/decrease/:email', async (req, res) => {
      const email = req.params.email;
      const { totalCost } = req.body;

      const result = await userCollection.updateOne(
        { email: email },
        { $inc: { coin: -totalCost } }
      );

      const notification = {
        to_email: email,
        message: 'A new task was added',
        current_time: new Date().toISOString(),
      };
      await notificationCollection.insertOne(notification);
      res.send(result);
    });

    // Task Collection related api
    app.post('/tasks', verifyToken, verifyTaskCreator, async (req, res) => {
      const newTask = req.body;
      const result = await taskCollection.insertOne(newTask);
      res.send(result);
    });
    app.get('/tasks/user/:email', verifyToken, verifyTaskCreator, async (req, res) => {
      const email = req.params.email;
      const query = { creator_email: email };
      const tasks = await taskCollection.find(query).sort({ created_at: -1 }).toArray();
      res.status(200).json(tasks);
    });
    app.get('/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(query);
      res.send(result);
    })
    app.put('/tasks/:id', verifyToken, verifyTaskCreator, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { task_title, task_quantity, submission_info, payable_amount, completion_date, task_detail, task_image_url } = req.body;
      const result = await taskCollection.updateOne(
        query,
        { $set: { task_title, task_detail, submission_info } }
      );
      res.send(result);
    });
    app.delete('/tasks/:id', verifyToken, verifyTaskCreator, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const task = await taskCollection.findOne(query);
      const result = await taskCollection.deleteOne(query);

      const coinIncrease = task.task_quantity * task.payable_amount;
      await userCollection.updateOne(
        { email: task.creator_email },
        { $inc: { coin: coinIncrease } }
      );

      res.send(result);
    });
    // tasks with taskCount > 0
    app.get('/tasks', verifyToken, async (req, res) => {
      const result = await taskCollection.find({ task_quantity: { $gt: 0 } }).toArray();
      res.send(result);
    });

    // GET specific task
    app.get('/tasks/:id', verifyToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await taskCollection.findOne(query);
      res.send(result);
    });

    // PATCH decrease task count by 1
    app.patch('/task_count/decrease/:id', verifyToken, verifyTaskCreator, async (req, res) => {
      try {
        const result = await db.collection('taskCollection').updateOne(
          { _id: new ObjectId(req.params.id) },
          { $inc: { task_quantity: -1 } }
        );
        if (result.matchedCount === 0) return res.status(404).send('Task not found');

        // Insert notification
        const notification = {
          message: `Task count decreased for task ID: ${req.params.id}`,
          task_id: new ObjectId(req.params.id),
          created_at: new Date().toISOString()
        };
        await db.collection('notifications').insertOne(notification);

        res.status(200).send('Task count decreased and notification added');
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    app.delete('/tasks/:id', async (req, res) => {

      const result = await db.collection('taskCollection').deleteOne({ _id: new ObjectId(req.params.id) });
      if (result.deletedCount === 0) return res.status(404).send('Task not found');

      // Increase user coins
      const coinIncrease = task.task_quantity * task.payable_amount;
      // Assume you have a function or mechanism to update user coins
      // updateUserCoins(task.creator_email, coinIncrease);

      res.status(200).send('Task deleted and user coins increased');
    });
    // Notification related api
    app.get('/notifications/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const notifications = await notificationCollection.find({ to_email: email }).sort({ current_time: -1 }).toArray();
      res.send(notifications);
    });

    // submission related api
    app.post('/submissions', verifyToken, verifyWorker, async (req, res) => {
      const submission = req.body;
      const result = await submissionCollection.insertOne(submission);
      res.send(result);
    });

    app.get('/submissions/creator/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const submissions = await submissionCollection.find({ creator_email: email, status: 'pending' }).toArray();
        res.send(submissions);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching submissions', error });
      }
    });

    app.get('/submissions/worker/:email',verifyToken, verifyWorker, async (req, res) => {
      const email = req.params.email;
      const query = { worker_email: email }
      const result = await submissionCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/submissions/approved/:email', async (req, res) => {
      const email = req.params.email;
        const result = await submissionCollection.find({ worker_email: email, status: 'approved' }).toArray();
        res.send(result);
    });

    app.patch('/submissions/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      try {
        const submission = await submissionCollection.findOne({ _id: new ObjectId(id) });
        if (!submission) {
          return res.status(404).send({ message: 'Submission not found' });
        }

        await submissionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } }
        );

        // Insert a notification for the worker
        const notification = {
          email: submission.worker_email,
          message: `Your submission for task ${submission.task_title} has been ${status}.`,
          date: new Date().toISOString()
        };
        await notificationCollection.insertOne(notification);

        if (status === 'approved') {
          await userCollection.updateOne(
            { email: submission.worker_email },
            { $inc: { coin: submission.payable_amount } }
          );
        }

        res.send({ message: 'Submission status updated successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Error updating submission status', error });
      }
    });
    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Task Master server is running successfully')
})
app.listen(port, () => {
  console.log(`Task Master server is running on port ${port}`)
})


