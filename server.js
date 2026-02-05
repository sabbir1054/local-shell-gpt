const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// List available models
app.get('/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle chat messages with streaming
  socket.on('chat', async (data) => {
    const { model = 'llama3.2', prompt, context = [] } = data;

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          context,
          stream: true
        })
      });

      if (!response.ok) {
        socket.emit('error', { message: `Ollama error: ${response.statusText}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            socket.emit('response', {
              text: json.response,
              done: json.done,
              context: json.context
            });
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle conversation (chat with message history)
  socket.on('conversation', async (data) => {
    const { model = 'llama3.2', messages } = data;

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true
        })
      });

      if (!response.ok) {
        socket.emit('error', { message: `Ollama error: ${response.statusText}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            socket.emit('response', {
              text: json.message?.content || '',
              done: json.done
            });
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Ollama host: ${OLLAMA_HOST}`);
});
