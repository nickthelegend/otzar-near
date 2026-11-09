import { Buffer } from 'buffer';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
(globalThis as any).Buffer = Buffer;
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
