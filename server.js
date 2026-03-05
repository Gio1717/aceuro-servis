const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.init();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'server' });
});

// Generic CRUD routes for each entity
const entities = ['objednavky', 'faktury', 'zakazky', 'prijemky'];

entities.forEach(entity => {
  // List all
  app.get(`/api/${entity}`, (req, res) => {
    try {
      res.json(db.getAll(entity));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get one
  app.get(`/api/${entity}/:id`, (req, res) => {
    try {
      const item = db.getById(entity, req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create
  app.post(`/api/${entity}`, (req, res) => {
    try {
      const item = db.insert(entity, req.body);
      res.status(201).json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update
  app.put(`/api/${entity}/:id`, (req, res) => {
    try {
      const item = db.update(entity, req.params.id, req.body);
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete
  app.delete(`/api/${entity}/:id`, (req, res) => {
    try {
      db.remove(entity, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Bulk import (for initial data migration)
app.post('/api/import', (req, res) => {
  try {
    const { objednavky, faktury, zakazky, prijemky } = req.body;
    let count = 0;
    if (objednavky) objednavky.forEach(o => { db.insert('objednavky', o); count++; });
    if (faktury) faktury.forEach(f => { db.insert('faktury', f); count++; });
    if (zakazky) zakazky.forEach(z => { db.insert('zakazky', z); count++; });
    if (prijemky) prijemky.forEach(p => { db.insert('prijemky', p); count++; });
    res.json({ ok: true, imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start listening if not required by Electron
if (!module.parent && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Progresklima server běží na http://localhost:${PORT}`);
  });
}

module.exports = app;
