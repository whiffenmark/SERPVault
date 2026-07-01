import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const handoffPath = path.join(projectRoot, 'docs', 'CODING_HANDOFF.md');

// Helper to run git commands safely
function runGit(command) {
  try {
    return execSync(command, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (err) {
    return '';
  }
}

// Get git branch
const branch = runGit('git branch --show-current') || 'main';

// Get latest pushed commit or fallback to HEAD
let latestCommit = '';
if (branch) {
  latestCommit = runGit(`git log -1 --oneline origin/${branch}`);
}
if (!latestCommit) {
  latestCommit = runGit('git log -1 --oneline HEAD');
}
if (!latestCommit) {
  latestCommit = 'No commit history found';
}

// Get changed files
function getChangedFiles() {
  const files = new Set();
  
  const diffOut = runGit('git diff --name-only HEAD');
  if (diffOut) {
    diffOut.split('\n').forEach(f => {
      const trimmed = f.trim();
      if (trimmed) files.add(trimmed);
    });
  }

  const untrackedOut = runGit('git ls-files --others --exclude-standard');
  if (untrackedOut) {
    untrackedOut.split('\n').forEach(f => {
      const trimmed = f.trim();
      if (trimmed) files.add(trimmed);
    });
  }

  return Array.from(files)
    .filter(file => file && !file.startsWith('node_modules/') && !file.startsWith('.next/'))
    .sort();
}

const headHash = runGit('git rev-parse --short HEAD') || 'unknown';

// Read the handoff file
if (!fs.existsSync(handoffPath)) {
  console.error(`Error: ${handoffPath} does not exist.`);
  process.exit(1);
}

// Today's date YYYY-MM-DD
const date = new Date();
const yyyy = date.getFullYear();
const mm = String(date.getMonth() + 1).padStart(2, '0');
const dd = String(date.getDate()).padStart(2, '0');
const todayStr = `${yyyy}-${mm}-${dd}`;

function writeHandoff(changedFilesList) {
  const content = fs.readFileSync(handoffPath, 'utf8');
  
  // Parse markdown into sections
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith('# ') || line.startsWith('## ')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { heading: line, lines: [line] };
    } else {
      if (!currentSection) {
        currentSection = { heading: '', lines: [] };
      }
      currentSection.lines.push(line);
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  const updatedSections = sections.map(section => {
    const heading = section.heading;
    
    if (heading === '## Context & Repository State') {
      const newLines = [
        '## Context & Repository State',
        `- **Current Branch**: \`${branch}\``,
        `- **Latest Pushed Commit**: \`${latestCommit}\``,
        `- **Final Session Batch**:`
      ];
      if (changedFilesList.length === 0) {
        newLines.push('  - *(No changes)*');
      } else {
        changedFilesList.forEach(file => {
          newLines.push(`  - [ ] \`${file}\``);
        });
      }
      newLines.push('');
      return {
        heading,
        lines: newLines
      };
    }
    
    if (heading === '## Change Log') {
      const logLines = [...section.lines];
      const targetHeading = `### [${todayStr}]`;
      let headingIndex = -1;
      
      for (let i = 0; i < logLines.length; i++) {
        if (logLines[i].trim() === targetHeading) {
          headingIndex = i;
          break;
        }
      }
      
      const autoSnapshotLines = [
        '<!-- AUTO_SNAPSHOT_START -->',
        `#### Auto Snapshot (HEAD: ${headHash})`,
        '- **Changed Files**:',
      ];
      if (changedFilesList.length === 0) {
        autoSnapshotLines.push('  - *(No changes)*');
      } else {
        changedFilesList.forEach(file => {
          autoSnapshotLines.push(`  - \`${file}\``);
        });
      }
      autoSnapshotLines.push(
        '- **Validation Reminders**:',
        '  - Run `npm run build` to verify types and Next.js compilation.',
        '  - Run `git diff --check` to check for stray spaces and conflict markers.',
        '<!-- AUTO_SNAPSHOT_END -->'
      );
      
      if (headingIndex === -1) {
        // Heading does not exist. Let's insert it.
        let insertIndex = -1;
        for (let i = 0; i < logLines.length; i++) {
          if (logLines[i].startsWith('### ')) {
            insertIndex = i;
            break;
          }
        }
        if (insertIndex === -1) {
          insertIndex = logLines.length;
        }
        
        const linesToInsert = [
          '',
          targetHeading,
          ...autoSnapshotLines,
        ];
        logLines.splice(insertIndex, 0, ...linesToInsert);
      } else {
        // Heading exists. Find if there's an existing auto snapshot block under it.
        let nextHeadingIndex = logLines.length;
        for (let i = headingIndex + 1; i < logLines.length; i++) {
          if (logLines[i].startsWith('### ')) {
            nextHeadingIndex = i;
            break;
          }
        }
        
        let startTagIndex = -1;
        let endTagIndex = -1;
        for (let i = headingIndex + 1; i < nextHeadingIndex; i++) {
          if (logLines[i].includes('<!-- AUTO_SNAPSHOT_START -->')) {
            startTagIndex = i;
          }
          if (logLines[i].includes('<!-- AUTO_SNAPSHOT_END -->')) {
            endTagIndex = i;
          }
        }
        
        if (startTagIndex !== -1 && endTagIndex !== -1 && startTagIndex < endTagIndex) {
          logLines.splice(startTagIndex, endTagIndex - startTagIndex + 1, ...autoSnapshotLines);
        } else {
          // Insert right after the heading
          logLines.splice(headingIndex + 1, 0, ...autoSnapshotLines);
        }
      }
      
      return {
        heading,
        lines: logLines
      };
    }
    
    return section;
  });

  // Reassemble markdown content
  let newContent = updatedSections.map(s => s.lines.join('\n')).join('\n');
  newContent = newContent.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  fs.writeFileSync(handoffPath, newContent, 'utf8');
}

// First pass: generate content
writeHandoff(getChangedFiles());

// Second pass: if docs/CODING_HANDOFF.md is now changed, include it
const changedFilesAfterWrite = getChangedFiles();
const isHandoffChanged = changedFilesAfterWrite.includes('docs/CODING_HANDOFF.md');

if (isHandoffChanged) {
  writeHandoff(changedFilesAfterWrite);
}

console.log('Successfully updated docs/CODING_HANDOFF.md');
