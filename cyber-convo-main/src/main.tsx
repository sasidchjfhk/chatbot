import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'prismjs/themes/prism-tomorrow.css'

createRoot(document.getElementById("root")!).render(<App />);
