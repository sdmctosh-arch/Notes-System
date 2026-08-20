import { Routes, Route } from 'react-router-dom';
import Inbox from './pages/Inbox';
import ItemDetail from './pages/ItemDetail';
import Archive from './pages/Archive';
import Vault from './pages/Vault';
import VaultNote from './pages/VaultNote';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inbox />} />
      <Route path="/items/:id" element={<ItemDetail />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/vault" element={<Vault />} />
      <Route path="/vault/:folder/:filename" element={<VaultNote />} />
    </Routes>
  );
}
