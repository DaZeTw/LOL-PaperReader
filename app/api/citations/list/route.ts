import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'citations');
    
    // Check if directory exists
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ files: [] });
    }

    // Read all JSON files in the citations directory
    const files = fs.readdirSync(dataDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          path: filePath
        };
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()); // Most recent first

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error listing citation files:', error);
    return NextResponse.json(
      { error: 'Failed to list citation files' },
      { status: 500 }
    );
  }
}