import { useState } from 'react';
import KeywordPanel from './components/KeywordPanel';
import './styles/components.css';

// PDF file in the public folder
const PDF_URL = '/2303.14334v2.pdf';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>📚 PDF Keyword Explorer</h1>
        <p>Explore keywords extracted from research papers with definitions and relationships</p>
      </header>

      <main className="app-main">
        <KeywordPanel pdfUrl={PDF_URL} />
      </main>
    </div>
  );
}

export default App;
