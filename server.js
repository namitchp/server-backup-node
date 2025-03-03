const http = require('http');
const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const archiver = require('archiver');
dotenv.config();

// Create an HTTP server
const server = http.createServer((req, res) => {
  // Set the response header
  res.writeHead(200, { 'Content-Type': 'text/plain' });

  // Handle different routes
  if (req.url === '/') {
    res.end('Welcome to the home page!');
  } else if (req.url === '/upload') {
    // Handle file upload logic here
    res.end('File upload endpoint');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

const s3Client = new S3Client({
  region: 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to send email notification
function sendEmailNotification(fileNames) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject: 'Backup Files Uploaded',
    html: `
      <h1>Backup Files Uploaded</h1>
      <p>The following backup files have been successfully uploaded to S3:</p>
      <ul>
        ${fileNames.map(fileName => `<li>${fileName}</li>`).join('')}
      </ul>
      <p>Best regards,<br>Your Backup Service</p>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.error(`Error sending email: ${error.message}`);
    }
    console.log(`Email sent: ${info.response}`);
  });
}

// Function to upload a file to S3 using multipart upload
async function uploadFile(filePath, uploadedFiles) {
  const fileStream = fs.createReadStream(filePath);
  const fileName = path.basename(filePath);
  console.log(`Uploading file: ${fileName}`);
  const uploadId = await createMultipartUpload(fileName);
  const partSize = 5 * 1024 * 1024; // 5MB minimum part size
  const parts = [];
  let partNumber = 1;
  let buffer = Buffer.alloc(0);

  for await (const chunk of fileStream) {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length >= partSize) {
      const partParams = {
        Bucket: 'serverdbbackuprit',
        Key: `data/${fileName}`,
        PartNumber: partNumber,
        UploadId: uploadId,
        Body: buffer,
      };
      const part = await s3Client.send(new UploadPartCommand(partParams));
      parts.push({ ETag: part.ETag, PartNumber: partNumber });
      partNumber++;
      buffer = Buffer.alloc(0);
    }
  }

  // Upload the last part if it exists
  if (buffer.length > 0) {
    const partParams = {
      Bucket: 'serverdbbackuprit',
      Key: `data/${fileName}`,
      PartNumber: partNumber,
      UploadId: uploadId,
      Body: buffer,
    };
    const part = await s3Client.send(new UploadPartCommand(partParams));
    parts.push({ ETag: part.ETag, PartNumber: partNumber });
  }

  await completeMultipartUpload(fileName, uploadId, parts);
  console.log(`File uploaded successfully: ${fileName}`);
  uploadedFiles.push(fileName); // Add file name to the list
}

async function createMultipartUpload(fileName) {
  const params = {
    Bucket: 'serverdbbackuprit',
    Key: `data/${fileName}`,
  };
  const command = new CreateMultipartUploadCommand(params);
  const response = await s3Client.send(command);
  return response.UploadId;
}

async function completeMultipartUpload(fileName, uploadId, parts) {
  console.log(`Completing multipart upload for file: ${fileName}`);

  const params = {
    Bucket: 'serverdbbackuprit',
    Key: `data/${fileName}`,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  };
  const command = new CompleteMultipartUploadCommand(params);
  await s3Client.send(command);
}

// Function to create a zip file for a single file
function createSingleFileZip(filePath, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => {
      console.log(`Zip file created: ${zipFilePath}`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.file(filePath, { name: path.basename(filePath) });
    archive.finalize();
  });
}

// Function to upload all files in the current directory
async function uploadFilesInDirectory() {
  const directoryPath = path.join(__dirname, '../../db/sql/data');
  console.log(`Uploading files in directory: ${directoryPath}`);
  const uploadedFiles = []; // List to store uploaded file names
  fs.readdir(directoryPath, async (err, files) => {
    if (err) {
      return console.error(`Unable to scan directory: ${err.message}`);
    }
    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const fileExtension = path.extname(file).toLowerCase();
      if (fs.lstatSync(filePath).isFile() && (fileExtension === '.mdf' || fileExtension === '.ldf')) {
        const zipFilePath = path.join(directoryPath, `${path.basename(file, fileExtension)}.zip`);
        await createSingleFileZip(filePath, zipFilePath);
        await uploadFile(zipFilePath, uploadedFiles);
        fs.unlinkSync(zipFilePath); // Delete the zip file after upload
      }
    }
    // Send email notification after all files are uploaded
    if (uploadedFiles.length > 0) {
      sendEmailNotification(uploadedFiles);
    }
  });
}

// Schedule the task to run every hour
// cron.schedule('0 * * * *', () => {
  console.log('Running file upload task...');
  uploadFilesInDirectory();
// });

// Start the server on port 3000
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('Server is running on http://localhost:' + port);
});
