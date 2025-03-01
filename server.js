const http = require('http');
const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
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


const s3Client = new S3Client({ region: 'your-region' });

// Function to upload a file to S3 using multipart upload
async function uploadFile(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);
    const uploadId = await createMultipartUpload(fileName);

    const partSize = 5 * 1024 * 1024; // 5MB
    const parts = [];
    let partNumber = 1;

    for await (const chunk of fileStream) {
        const partParams = {
            Bucket: 'your-bucket-name',
            Key: fileName,
            PartNumber: partNumber,
            UploadId: uploadId,
            Body: chunk
        };
        const part = await s3Client.send(new UploadPartCommand(partParams));
        parts.push({ ETag: part.ETag, PartNumber: partNumber });
        partNumber++;
    }

    await completeMultipartUpload(fileName, uploadId, parts);
    console.log(`File uploaded successfully: ${fileName}`);
}

async function createMultipartUpload(fileName) {
    const params = {
        Bucket: 'your-bucket-name',
        Key: fileName
    };
    const command = new CreateMultipartUploadCommand(params);
    const response = await s3Client.send(command);
    return response.UploadId;
}

async function completeMultipartUpload(fileName, uploadId, parts) {
    const params = {
        Bucket: 'your-bucket-name',
        Key: fileName,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
    };
    const command = new CompleteMultipartUploadCommand(params);
    await s3Client.send(command);
}

// Function to upload all files in the current directory
async function uploadFilesInDirectory() {
    const directoryPath = __dirname;
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return console.error(`Unable to scan directory: ${err.message}`);
        }
        files.forEach(file => {
            const filePath = path.join(directoryPath, file);
            if (fs.lstatSync(filePath).isFile()) {
                uploadFile(filePath);
            }
        });
    });
}

// Schedule the task to run every hour
cron.schedule('0 * * * *', () => {
    console.log('Running file upload task...');
    uploadFilesInDirectory();
});


// Start the server on port 3000
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
