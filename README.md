# Server Backup

This project handles the backup of server files to an S3 bucket and sends email notifications upon successful uploads.

## Features

- Uploads files to S3 using multipart upload.
- Sends email notifications after successful uploads.
- Schedules the upload task to run every hour using cron.

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```env
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   EMAIL_USER=your_email@example.com
   EMAIL_PASS=your_email_password
   NOTIFICATION_EMAIL=notification_email@example.com
   PORT=3000
   ```

## Usage

1. Start the server:
   ```bash
   node server.js
   ```
2. The server will run on `http://localhost:3000`.
3. The upload task will run every hour and upload files from the `../../db/data` directory to the S3 bucket.

## Endpoints

- `/` - Home page.
- `/upload` - File upload endpoint (to be implemented).

## License

This project is licensed under the MIT License.
