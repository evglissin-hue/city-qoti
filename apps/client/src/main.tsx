import { render } from 'preact';
import { App } from './app/App';
import './ui/theme.css';

render(<App />, document.getElementById('app')!);
