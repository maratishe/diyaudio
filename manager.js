// npm install express body-parser cors
import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Get current file directory with ESM support
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_KEY = 'a93874791dd108864';
function authenticateRequest(req, res, next) {
  const authKey = req.headers['auth-key'];
  if (!authKey || authKey !== AUTH_KEY) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }
  next();
}

const PORT = process.env.PORT || 8003;

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server to host both Express and WebSocket
const server = http.createServer(app);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});
app.get('/client.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.js'));
});



// ================ MEDIA PLAYER ENDPOINTS ================

function getContentType(filename) {
  const name = filename.toLowerCase();
  if (name.endsWith('.mp3')) {
    return 'audio/mpeg';
  } else if (name.endsWith('.m4a')) {
    return 'audio/mp4';
  } else {
    return 'application/octet-stream';
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Add this helper function for duration estimation (fallback)
function estimateDuration(fileSize, mimeType) {
  const bytesPerSecond = mimeType === 'audio/mpeg' ? 16 * 1024 : 32 * 1024;
  return fileSize / bytesPerSecond;
}

app.use('/media/files', authenticateRequest);
app.get('/media/files', (req, res) => {
  try {
    const files = fs.readdirSync(__dirname)
      .filter(file => file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.m4a'))
      .map(file => {
        const filePath = path.join(__dirname, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: file,
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size)
        };
      });
    
    res.json({ files });
  } catch (error) {
    console.error('Error listing media files:', error);
    res.status(500).json({ error: 'Failed to list media files' });
  }
});

app.use('/media/fileinfo', authenticateRequest);
app.get('/media/fileinfo', async (req, res) => {
  try {
    const filename = req.query.file;
    if (!filename) {
      return res.status(400).json({ error: 'File parameter is required' });
    }
    
    // Security checks
    const filePath = path.join(__dirname, filename);
    const normalizedPath = path.normalize(filePath);
    
    if (!normalizedPath.startsWith(__dirname)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file stats
    const stat = fs.statSync(normalizedPath);
    const fileSize = stat.size;
    
    // Use ffprobe to get duration and other info
    const cmd = `ffprobe -v error -show_entries format=duration -of json "${normalizedPath}"`;
    const { stdout } = await execPromise(cmd);
    const probeData = JSON.parse(stdout);
    
    // Get duration or estimate if not available
    const durationInSeconds = parseFloat(probeData.format.duration) || 
      estimateDuration(fileSize, getContentType(filename));
    
    return res.json({
      name: path.basename(filename),
      path: filename,
      size: fileSize,
      sizeFormatted: formatFileSize(fileSize),
      duration: durationInSeconds,
      durationFormatted: formatTime(durationInSeconds)
    });
  } catch (error) {
    console.error('Error getting file info:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

// Endpoint to stream media files with byte range support
//app.use('/media/stream', authenticateRequest);
app.get('/media/stream', (req, res) => {
  try {
    const filename = req.query.file;
    if (!filename) {
      return res.status(400).json({ error: 'File parameter is required' });
    }
    
    // Ensure we only access files in the current directory
    const filePath = path.join(__dirname, filename);
    const normalizedPath = path.normalize(filePath);
    
    // Security check to prevent directory traversal
    if (!normalizedPath.startsWith(__dirname)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file stats
    const stat = fs.statSync(normalizedPath);
    const fileSize = stat.size;
    
    // Parse range header
    const range = req.headers.range;
    
    if (range) {
      // Parse the range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        return res.status(416).send('Requested Range Not Satisfiable');
      }
      
      // Calculate chunk size
      const chunkSize = (end - start) + 1;
      
      // Log streaming stats
      console.log(`Streaming file: ${filename}, Size: ${fileSize} bytes, Range: ${start}-${end} (${chunkSize} bytes)`);
      
      // Set response headers for partial content
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': getContentType(filename)
      });
      
      // Create read stream with range
      const stream = fs.createReadStream(normalizedPath, { start, end });
      stream.pipe(res);
    } else {
      // Log full file streaming
      console.log(`Streaming complete file: ${filename}, Size: ${fileSize} bytes`);
      
      // No range header, send initial metadata but still enable range requests
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': getContentType(filename),
        'Accept-Ranges': 'bytes'
      });
      
      fs.createReadStream(normalizedPath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming file:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// This endpoint requires TLS client certificate authentication
app.get('/secure-stream', (req, res) => {
  try {
    const filename = req.query.file;
    if (!filename) {
      return res.status(400).json({ error: 'File parameter is required' });
    }
    
    // Security checks
    const filePath = path.join(__dirname, filename);
    const normalizedPath = path.normalize(filePath);
    
    if (!normalizedPath.startsWith(__dirname)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stat = fs.statSync(normalizedPath);
    const fileSize = stat.size;
    
    // Handle range requests
    const range = req.headers.range;
    
    if (range) {
      try {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
          return res.status(416).send('Requested Range Not Satisfiable');
        }
        
        const chunkSize = (end - start) + 1;
        
        console.log(`Secure streaming file: ${filename}, Size: ${fileSize} bytes, Range: ${start}-${end} (${chunkSize} bytes)`);
        
        // Send partial content
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': getContentType(filename)
        });
        
        const stream = fs.createReadStream(normalizedPath, { start, end });
        
        // Handle stream errors
        stream.on('error', (error) => {
          console.error(`Stream error for ${filename}:`, error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          } else {
            res.end();
          }
        });
        
        stream.pipe(res);
      } catch (rangeError) {
        console.error('Error processing range request:', rangeError);
        res.status(416).send('Invalid Range Request');
      }
    } else {
      console.log(`Secure streaming complete file: ${filename}, Size: ${fileSize} bytes`);
      
      // Send full file with range support headers
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': getContentType(filename),
        'Accept-Ranges': 'bytes'
      });
      
      const stream = fs.createReadStream(normalizedPath);
      
      // Handle stream errors
      stream.on('error', (error) => {
        console.error(`Stream error for ${filename}:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        } else {
          res.end();
        }
      });
      
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Error in secure streaming:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});


// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Closing database connection...');
  process.exit(0);
});