import { useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check, Settings, Trash2 } from 'lucide-react';

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    status: 'Active' | 'Inactive';
}

const mockUsers: User[] = [
    { id: 'usr_1', name: 'Alice Smith', email: 'alice@example.com', role: 'Admin', status: 'Active' },
    { id: 'usr_2', name: 'Bob Jones', email: 'bob@example.com', role: 'Editor', status: 'Active' },
    { id: 'usr_3', name: 'Charlie Brown', email: 'charlie@example.com', role: 'Viewer', status: 'Inactive' },
    { id: 'usr_4', name: 'Diana Prince', email: 'diana@example.com', role: 'Editor', status: 'Active' },
];

export function DataTable() {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggleAll = () => {
        if (selected.size === mockUsers.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(mockUsers.map((u) => u.id)));
        }
    };

    const toggleOne = (id: string, checked: boolean) => {
        const next = new Set(selected);
        if (checked) next.add(id);
        else next.delete(id);
        setSelected(next);
    };

    const handleDelete = () => {
        alert(`Deleted ${selected.size} users: ${Array.from(selected).join(', ')}`);
        setSelected(new Set());
    };

    return (
        <div className="w-full rounded-md border border-zinc-800 bg-zinc-950 mt-8 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                <h3 className="text-lg font-medium text-zinc-100">User Management</h3>
                <div className="flex gap-2">
                    <button
                        disabled={selected.size === 0}
                        onClick={handleDelete}
                        className="flex items-center gap-2 rounded-md bg-red-950 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete Selected
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-zinc-400">
                    <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/80 border-b border-zinc-800">
                        <tr>
                            <th scope="col" className="p-4 w-4">
                                <div className="flex items-center">
                                    <Checkbox.Root
                                        className="flex h-4 w-4 appearance-none items-center justify-center rounded-[4px] border border-zinc-700 bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-zinc-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                        id="checkbox-all-search"
                                        checked={selected.size === mockUsers.length && mockUsers.length > 0}
                                        onCheckedChange={toggleAll}
                                        aria-label="Select all users"
                                    >
                                        <Checkbox.Indicator className="text-white">
                                            <Check className="h-3 w-3 font-bold" />
                                        </Checkbox.Indicator>
                                    </Checkbox.Root>
                                </div>
                            </th>
                            <th scope="col" className="px-6 py-3 font-medium text-zinc-300">Name</th>
                            <th scope="col" className="px-6 py-3 font-medium text-zinc-300">Role</th>
                            <th scope="col" className="px-6 py-3 font-medium text-zinc-300">Status</th>
                            <th scope="col" className="px-6 py-3 font-medium text-zinc-300 sr-only">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockUsers.map((user) => (
                            <tr
                                key={user.id}
                                className={`border-b border-zinc-800 hover:bg-zinc-900/40 transition-colors ${selected.has(user.id) ? 'bg-indigo-950/20' : ''}`}
                            >
                                <td className="w-4 p-4">
                                    <div className="flex items-center">
                                        <Checkbox.Root
                                            className="flex h-4 w-4 appearance-none items-center justify-center rounded-[4px] border border-zinc-700 bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-zinc-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                            id={`checkbox-${user.id}`}
                                            checked={selected.has(user.id)}
                                            onCheckedChange={(checked) => toggleOne(user.id, checked === true)}
                                            aria-label={`Select ${user.name}`}
                                        >
                                            <Checkbox.Indicator className="text-white">
                                                <Check className="h-3 w-3 font-bold" />
                                            </Checkbox.Indicator>
                                        </Checkbox.Root>
                                    </div>
                                </td>
                                <th scope="row" className="px-6 py-4 font-medium text-zinc-100 whitespace-nowrap">
                                    {user.name}
                                    <div className="text-xs text-zinc-500 font-normal">{user.email}</div>
                                </th>
                                <td className="px-6 py-4">
                                    {user.role}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <div className={`h-2.5 w-2.5 rounded-full mr-2 ${user.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                        {user.status}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-zinc-400 hover:text-indigo-400 transition-colors p-2 rounded-md hover:bg-zinc-800" aria-label={`Manage user ${user.name}`}>
                                        <Settings className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
