import React from 'react';
import ReactDOM from 'react-dom/client';
import { StoreProvider } from './store';
import { ToastProvider } from './components/toast';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>
  </React.StrictMode>,
);
