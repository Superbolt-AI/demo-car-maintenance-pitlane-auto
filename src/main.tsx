import React from 'react';
import {createRoot} from 'react-dom/client';
import Workshop from './Workshop';
import './styles.css';
const path=window.location.pathname.replace(/\/$/,'');
createRoot(document.getElementById('root')!).render(<React.StrictMode><Workshop page={path==='/pricing'?'pricing':path==='/appointments'?'appointments':'quote'}/></React.StrictMode>);
