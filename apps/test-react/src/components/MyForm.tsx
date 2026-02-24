import React, { useState } from 'react';

export default function MyForm() {
    const [email, setEmail] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Submitted with email", email);
    }

    return (
        <form id="react-contact-form" onSubmit={handleSubmit}>
            <h2>React Test Form</h2>
            <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" className="submit-btn text-white bg-blue-500 p-2 m-2">Submit</button>
        </form>
    )
}
