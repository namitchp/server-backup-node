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
const archiver = require('archiver');
dotenv.config();
// Create an HTTP server
const server = http.createServer((req, res) => {
  // Set the response header
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  // Handle different routes
  if (req.url === '/') {
    res.end('Welcome to Backup File! Server');
  } else if (req.url === '/upload') {
    // Handle file upload logic here
    res.end('File upload endpoint');
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
let uploadedFiles = []; // List to store uploaded file names globally
// Function to send email notification
function sendEmailNotification() {
  const currentDateTime = new Date().toLocaleString();
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFICATION_EMAIL,
    cc: process.env.CCEMAIL_USER,
    subject: `Backup Files Uploaded - ${currentDateTime}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h1 style="color: #4CAF50;">Backup Files Uploaded</h1>
        <p>The following backup files have been successfully uploaded to S3 in the last 8 hours:</p>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">#</th>
              <th style="border: 1px solid #ddd; padding: 8px;">File Name</th>
            </tr>
          </thead>
          <tbody>
            ${uploadedFiles
              .map(
                (fileName, index) => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
                  index + 1
                }</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${fileName}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <p style="margin-top: 20px;">Best regards,<br>Your Backup Service</p>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.error(`Error sending email: ${error.message}`);
    }
    console.log(`Email sent: ${info.response}`);
    uploadedFiles = []; // Clear the uploadedFiles array after sending the email
  });
}

let running = false;
// Function to upload a file to S3 using multipart upload
async function uploadFile(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const fileName = path.basename(filePath);
  console.log(`Uploading file: ${fileName}`);
  const uploadId = await createMultipartUpload(fileName);
  const partSize = 5 * 1024 * 1024; // 5MB minimum part size
  const parts = [];
  let partNumber = 1;
  let buffer = Buffer.alloc(0); // Use Buffer.alloc() instead of Buffer()

  for await (const chunk of fileStream) {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length >= partSize) {
      const partParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `data/${fileName}`,
        PartNumber: partNumber,
        UploadId: uploadId,
        Body: buffer,
      };
      const part = await s3Client.send(new UploadPartCommand(partParams));
      parts.push({ ETag: part.ETag, PartNumber: partNumber });
      partNumber++;
      buffer = Buffer.alloc(0); // Use Buffer.alloc() instead of Buffer()
    }
  }

  // Upload the last part if it exists
  if (buffer.length > 0) {
    const partParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
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
}

async function createMultipartUpload(fileName) {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `data/${fileName}`,
  };
  const command = new CreateMultipartUploadCommand(params);
  const response = await s3Client.send(command);
  return response.UploadId;
}
async function completeMultipartUpload(fileName, uploadId, parts) {
  console.log(`Completing multipart upload for file: ${fileName}`);

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `data/${fileName}`,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  };
  const command = new CompleteMultipartUploadCommand(params);
  await s3Client.send(command);
}
// Function to create a zip file for a single file
// Function to create a zip file for the entire directory
function createDirectoryZip(directoryPath, zipFilePath) {
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
    archive.directory(directoryPath, false);
    archive.finalize();
  });
}

// Function to upload all files in the current directory
async function uploadFilesInDirectory() {
  running = true;
  const currentHour = new Date().getHours();
  const directoryPath = path.join(__dirname, '../Database Backup');
  // const directoryPath = path.join(__dirname, '../../db/sql/data');
  const zipFilePath = path.join(directoryPath, `../backup_${currentHour}.zip`);

  // Check if the directory has files
  const files = fs.readdirSync(directoryPath);
  if (files.length === 0) {
    console.log('No files to upload. Skipping upload.');
    running = false;
    return;
  }

  // Check if the zip file already exists and delete it
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }

  await createDirectoryZip(directoryPath, zipFilePath);
  await uploadFile(zipFilePath);
  fs.unlinkSync(zipFilePath); // Delete the zip file after upload

  // Delete all files in the current directory
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }
  console.log(`All files in the directory deleted: ${directoryPath}`);

  uploadedFiles.push(path.basename(zipFilePath)); // Add file name to the list
  running = false;
  if (
    currentHour === 8 ||
    currentHour === 13 ||
    currentHour === 17 ||
    currentHour === 20 ||
    currentHour === 23
  ) {
    sendEmailNotification();
  }
}

// Schedule the task to run every 80 minutes
cron.schedule('*/10 * * * *', () => {
  if (running) {
    console.log('Files have already been uploaded. Skipping upload.');
    return;
  }
  uploadFilesInDirectory();
});

// Start the server on port 3000
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('Server is running on http://localhost:' + port);
});
