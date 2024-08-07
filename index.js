const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const bodyParser = require("body-parser");
const axios = require('axios');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
dotenv.config();
const mongoUrl = process.env.mongoUrl;
const port = process.env.port || 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: true}));
app.use(cors({
    origin: '*' 
  }));

  const connect = async () => {
    await mongoose.connect(mongoUrl);
    console.log('Database connected');
  };
  const plantSchema = new mongoose.Schema({
    name: String,
    health:{type:Boolean,default:true},
  });
  const Plant = mongoose.model('Plant', plantSchema);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  });
  
  const upload = multer({ storage: storage,limits: { fileSize: 10 * 1024 * 1024 } });
  
  const genAI = new GoogleGenerativeAI(process.env.ApiKey);
  
  function fileToGenerativePart(path, mimeType) {
    const data = fs.readFileSync(path);
    return {
      inlineData: {
        data: data.toString('base64'),
        mimeType,
      },
    };
  }
app.get('/', (req, res) => {
  res.send('Hello World! from this docker');
});
app.post('/health', upload.single('photo'), async (req, res) => {
  
  console.log("req recived")
if (!req.file) {
  return res.status(400).send('No file uploaded.');
}

try {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const promptName = "Here is image of plant. Tell it is healthy or not.If healthy then just say healthy if not then tell unhealthy.";
  const promptDetails = "If this plant is unhealthy then tell what is the problem in it and what is the solution in 6-8 lines.";
  const imageParts = [fileToGenerativePart(req.file.path, 'image/jpeg')];
  
  const resultDetail = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: promptDetails }, ...imageParts] }],
  });
  const resultName = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: promptName }, ...imageParts] }],
  });
  const responseDetails = await resultDetail.response;
  const responseName = await resultName.response;
  const text = responseDetails.text();
  console.log(text)
  console.log(req.body.name);
  const plant = await Plant.findOne({ name: req.body.name.trim() });
  if (plant) {
    console.log('Plant found:', plant.name);
    console.log('AI response:', responseName.text());
    const isHealthy = responseName.text().toLowerCase().includes("unhealthy");
    console.log('Is healthy:', !isHealthy);
    // Update the plant's health status
    await Plant.findByIdAndUpdate(plant._id, { health: !isHealthy });
  } else {
    console.log('Plant not found:', req.body.name);
  }
  const response = {
    name: responseName.text(),
    details: responseDetails.text(),
  };
  res.json(response);
} catch (error) {
  console.error(error);
  res.status(500).send('Something went wrong');
} finally {
  fs.unlinkSync(req.file.path); // Delete the file after processing
}
});
app.post('/plant', async (req, res) => {
  const namePlant = req.body.name.trim();
  const isPresent = await Plant.findOne({ name: namePlant });
  if (isPresent) {
    res.status(400).send('Plant already exists');
    return;
  }
   await Plant.create({ name: namePlant });

  res.send('Plant added');
});
app.post('/upload',  async (req, res) => {
  
    console.log("req recived")
  if (!req.body.imageURL) {
    return res.status(400).send('No file uploaded.');
  }
   
  try {
    const imageURL = req.body.imageURL;
    console.log(`Fetching image from URL: ${imageURL}`);

    // Fetch the image data from the provided URL
    const response1 = await axios.get(imageURL, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response1.data, 'binary');

    const tempFilePath = path.join(uploadsDir, `${Date.now()}.jpg`);
    fs.writeFileSync(tempFilePath, buffer);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const promptName = "What is this plant name in just 2-4 words is no plant then tell No plant found.";
    const promptDetails = "What is this plant? Tell me its details and what type it is in 6-8 lines.";
    const imageParts = [fileToGenerativePart(tempFilePath, 'image/jpeg')];
    
    const resultDetail = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptDetails }, ...imageParts] }],
    });
    const resultName = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptName }, ...imageParts] }],
    });
    const responseDetails = await resultDetail.response;
    const responseName = await resultName.response;
    const text = responseDetails.text();
    console.log(text)
    const response = {
      name: responseName.text(),
      details: responseDetails.text(),
    };
    res.json(response);
    fs.unlinkSync(tempFilePath);
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong');
  } 
});
app.post('/getreq', async (req, res) => {
  console.log(req.body);
  const name = req.body.name;
  const promptReq = `I want to plant ${name} in my garden. Tell me what are the requirements for it like sunlight watering in 6-7 lines.`;
  const promptPro = `I want to plant ${name} in my garden. Tell me the process of planting it in 6-7 lines or stages.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const resultReq = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptReq }] }],
    });

    const resultPro = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptPro }] }],
    });

    const responseReq = await resultReq.response;
    const responsePro = await resultPro.response;

    const textReq = responseReq.text();
    const textPro = responsePro.text();

    const requirementsArray = textReq.split('. ').filter(sentence => sentence.trim().length > 0);

    const processArray = textPro.split('\n').map(line => {
      const [titlePart, ...descriptionParts] = line.split(':');
      const title = titlePart.trim().replace(/^\d+\.\s*/, '').replace(/\*\*/g, ''); // Remove leading number and stars
      const description = descriptionParts.join(':').trim().replace(/\*\*/g, ''); // Join description parts and remove stars
      return { title, description };
    }).filter(step => step.title && step.description);

    console.log(requirementsArray, processArray);

    res.json({ requirements: requirementsArray, process: processArray });
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong');
  }
});

app.post('/getplant', async (req, res) => {
  const plants= await Plant.find();
  res.json(plants);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  connect();
});