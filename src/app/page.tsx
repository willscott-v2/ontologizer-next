"use client";

import React, { useState } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.trim().toLowerCase() === 'hello world') {
      setSuccess(true);
    } else {
      setSuccess(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-4">Hello World Challenge</h1>
      <p className="mb-2">Type <span className="font-mono">hello world</span> below:</p>
      <input
        type="text"
        value={input}
        onChange={handleChange}
        className="border rounded px-2 py-1 mb-4 text-black"
        placeholder="Type here..."
      />
      {success && (
        <div className="text-green-600 font-semibold">Success! You typed &#39;hello world&#39;.</div>
      )}
    </main>
  );
}
