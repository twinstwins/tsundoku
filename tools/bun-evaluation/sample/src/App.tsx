import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [count, setCount] = useState(0);
  return <main className={styles.card}>
    <h1>Bun比較検証</h1>
    <p role="status">カウント: {count}</p>
    <button onClick={() => setCount(value => value + 1)}>カウントを増やす</button>
  </main>;
}
