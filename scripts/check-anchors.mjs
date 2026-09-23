#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, join, dirname, normalize } from 'node:path';

const DOCS = ['README.md', 'ARCHITECTURE.md', 'POSITIONING.md', 'CONTRIBUTING.md'];
const root = process.cwd();

function slugify(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function getAnchors(filePath) {
  const content = readFileSync(resolve(root, filePath), 'utf8');
  const anchors = new Set();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) {
      anchors.add(slugify(m[1]));
    }
  }
  return anchors;
}

const fileAnchors = new Map();
for (const doc of DOCS) {
  try {
    fileAnchors.set(doc, getAnchors(doc));
  } catch (err) {
    console.error(`Failed to read doc ${doc}:`, err.message);
    process.exit(1);
  }
}

let totalLinks = 0;
const errors = [];

for (const doc of DOCS) {
  const content = readFileSync(resolve(root, doc), 'utf8');
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const target = match[2];
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) {
      continue;
    }
    if (!target.includes('#')) {
      continue;
    }
    totalLinks++;
    const [filePart, anchorPart] = target.split('#');
    let targetDoc = doc;
    if (filePart) {
      targetDoc = filePart.replace(/^\.\//, '');
    }
    if (!fileAnchors.has(targetDoc)) {
      errors.push(`${doc}: Target document '${targetDoc}' in '${target}' is not in monitored docs list.`);
      continue;
    }
    const validAnchors = fileAnchors.get(targetDoc);
    if (!validAnchors.has(anchorPart)) {
      errors.push(`${doc}: Broken anchor '#${anchorPart}' in target '${target}'`);
    }
  }
}

console.log(`Checked ${totalLinks} internal anchors across ${DOCS.length} documents.`);
if (errors.length > 0) {
  console.error(`Found ${errors.length} broken links:`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log('All internal doc anchors resolved successfully.');
  process.exit(0);
}
