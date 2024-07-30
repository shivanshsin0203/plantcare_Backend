const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
dotenv.config();
const port = process.env.port || 3000;

app.use(cors({
    origin: '*' 
  }));
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  });
  
  const upload = multer({ storage: storage });
  
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
app.post('/upload', upload.single('photo'), async (req, res) => {
  
    console.log("req recived")
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = "What is this plant? Tell me its details and what type it is.";
    const imageParts = [fileToGenerativePart(req.file.path, 'image/jpeg')];
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
    });

    const response = await result.response;
    const text = response.text();
    console.log(text)
    res.send(text);
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong');
  } finally {
    fs.unlinkSync(req.file.path); // Delete the file after processing
  }
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});