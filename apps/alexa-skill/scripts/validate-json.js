const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'dist']);
const jsonFiles = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) collect(path.join(directory, entry.name));
      continue;
    }
    if (entry.name.endsWith('.json')) jsonFiles.push(path.join(directory, entry.name));
  }
}

collect(root);

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}

console.log(`Validated ${jsonFiles.length} JSON files.`);
