import React from 'react';
import ReactDOM from 'react-dom/client';
import { WorkspaceGateway } from './components/WorkspaceGateway';
import { ToastProvider } from './components/toast';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceGateway>
      <ToastProvider>
        <App />
      </ToastProvider>
    </WorkspaceGateway>
  </React.StrictMode>,
);
