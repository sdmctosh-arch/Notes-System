import { Routes, Route } from 'react-router-dom';
import Inbox from './pages/Inbox';
import ItemDetail from './pages/ItemDetail';
import Archive from './pages/Archive';
import Vault from './pages/Vault';
import VaultNote from './pages/VaultNote';
import Search from './pages/Search';
import Lists from './pages/Lists';
import CaptureView from './pages/CaptureView';
import NewItem from './pages/NewItem';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inbox />} />
      <Route path="/items/:id" element={<ItemDetail />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/vault" element={<Vault />} />
      <Route path="/vault/:folder/:filename" element={<VaultNote />} />
      <Route path="/search" element={<Search />} />
      <Route path="/lists" element={<Lists />} />
      <Route path="/capture/:captureId" element={<CaptureView />} />
      <Route path="/new" element={<NewItem />} />
    </Routes>
  );
}
