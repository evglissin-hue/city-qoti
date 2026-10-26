import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-400-italic.css';
import '@fontsource/alegreya/latin-700.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-700.css';
import { render } from 'preact';
import { App } from './app/App';
import { applyStoredSettings } from './ui/settings';
import './ui/theme.css';

applyStoredSettings();
render(<App />, document.getElementById('app')!);
