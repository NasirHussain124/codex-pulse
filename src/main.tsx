import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './LedgerApp';
import './ledger.css';

class Boundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="fatal"><div className="brand-icon">↗</div><h1>Let’s get your pulse back.</h1><p>The interface couldn’t load. Your saved accounts are still on this computer.</p><button onClick={() => location.reload()}>Reload Codex Pulse</button></main> : this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>);
