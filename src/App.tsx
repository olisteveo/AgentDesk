import type { FC } from 'react';
import OfficeCanvas from './components/OfficeCanvas';
import './App.css';

const App: FC = () => {
  return (
    <div className="app">
      <OfficeCanvas />
    </div>
  );
};

export default App;
