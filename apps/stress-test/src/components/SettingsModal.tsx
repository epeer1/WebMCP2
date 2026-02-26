import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Check, ChevronDown } from 'lucide-react';

const formSchema = z.object({
    environment: z.enum(['development', 'staging', 'production']),
    retryCount: z.number().min(0).max(10),
    webhookUrl: z.string().url(),
});

type FormValues = z.infer<typeof formSchema>;

export function SettingsModal() {
    const [open, setOpen] = useState(false);
    const [lastSaved, setLastSaved] = useState<FormValues | null>(null);

    const {
        register,
        control,
        handleSubmit,
        formState: { errors },
        reset
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            environment: 'development',
            retryCount: 3,
            webhookUrl: 'https://api.example.com/webhook',
        },
    });

    const onSubmit = (data: FormValues) => {
        setLastSaved(data);
        setOpen(false);
        reset(data); // reset to new defaults
    };

    return (
        <>
            <div className="flex flex-col gap-4 items-start">
                <Dialog.Root open={open} onOpenChange={setOpen}>
                    <Dialog.Trigger asChild>
                        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition-colors">
                            Configure Webhook Settings
                        </button>
                    </Dialog.Trigger>

                    <Dialog.Portal>
                        <Dialog.Overlay className="bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 backdrop-blur-sm" />
                        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-zinc-800 bg-zinc-950 p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl">
                            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                                <Dialog.Title className="text-lg font-semibold leading-none tracking-tight text-zinc-100">
                                    Advanced Configuration
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-zinc-400">
                                    Make changes to your environment strategy here. Click save when you're done.
                                </Dialog.Description>
                            </div>

                            <form id="settings-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">

                                {/* Custom Radix Select Field (Very complex DOM structure) */}
                                <div className="space-y-2">
                                    <label htmlFor="environment" className="text-sm font-medium leading-none text-zinc-200">
                                        Deployment Environment
                                    </label>
                                    <Controller
                                        control={control}
                                        name="environment"
                                        render={({ field }) => (
                                            <Select.Root value={field.value} onValueChange={field.onChange}>
                                                <Select.Trigger
                                                    id="environment"
                                                    aria-label="Deployment Environment"
                                                    className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <Select.Value placeholder="Select an environment" />
                                                    <Select.Icon asChild>
                                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                                    </Select.Icon>
                                                </Select.Trigger>
                                                <Select.Portal>
                                                    <Select.Content className="relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-md animate-in fade-in-80">
                                                        <Select.Viewport className="p-1">
                                                            <Select.Item value="development" className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-zinc-800 focus:text-zinc-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                                                    <Select.ItemIndicator>
                                                                        <Check className="h-4 w-4" />
                                                                    </Select.ItemIndicator>
                                                                </span>
                                                                <Select.ItemText>Development</Select.ItemText>
                                                            </Select.Item>
                                                            <Select.Item value="staging" className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-zinc-800 focus:text-zinc-100">
                                                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                                                    <Select.ItemIndicator>
                                                                        <Check className="h-4 w-4" />
                                                                    </Select.ItemIndicator>
                                                                </span>
                                                                <Select.ItemText>Staging (Pre-prod)</Select.ItemText>
                                                            </Select.Item>
                                                            <Select.Item value="production" className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-zinc-800 focus:text-zinc-100">
                                                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                                                    <Select.ItemIndicator>
                                                                        <Check className="h-4 w-4" />
                                                                    </Select.ItemIndicator>
                                                                </span>
                                                                <Select.ItemText>Production</Select.ItemText>
                                                            </Select.Item>
                                                        </Select.Viewport>
                                                    </Select.Content>
                                                </Select.Portal>
                                            </Select.Root>
                                        )}
                                    />
                                    {errors.environment && <p className="text-[0.8rem] font-medium text-red-500">{errors.environment.message}</p>}
                                </div>

                                {/* Standard Input */}
                                <div className="space-y-2">
                                    <label htmlFor="webhookUrl" className="text-sm font-medium leading-none text-zinc-200">
                                        Webhook Destination URL
                                    </label>
                                    <input
                                        id="webhookUrl"
                                        type="url"
                                        {...register('webhookUrl')}
                                        placeholder="https://..."
                                        className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    {errors.webhookUrl && <p className="text-[0.8rem] font-medium text-red-500">{errors.webhookUrl.message}</p>}
                                </div>

                                {/* Number Input */}
                                <div className="space-y-2">
                                    <label htmlFor="retryCount" className="text-sm font-medium leading-none text-zinc-200">
                                        Max Retry Attempts
                                    </label>
                                    <input
                                        id="retryCount"
                                        type="number"
                                        min="0"
                                        max="10"
                                        {...register('retryCount', { valueAsNumber: true })}
                                        className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    {errors.retryCount && <p className="text-[0.8rem] font-medium text-red-500">{errors.retryCount.message}</p>}
                                </div>
                            </form>

                            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                                <Dialog.Close asChild>
                                    <button type="button" className="mt-2 inline-flex h-10 items-center justify-center rounded-md border border-zinc-800 bg-transparent px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 transition-colors sm:mt-0">
                                        Cancel
                                    </button>
                                </Dialog.Close>
                                <button
                                    type="submit"
                                    form="settings-form"
                                    className="inline-flex h-10 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                                >
                                    Save changes
                                </button>
                            </div>
                            <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-zinc-950 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-zinc-800 data-[state=open]:text-zinc-400">
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close</span>
                            </Dialog.Close>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>

                {lastSaved && (
                    <div className="p-4 border border-green-900/50 bg-green-950/20 rounded-md text-sm text-green-400 w-full">
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <Check className="h-4 w-4" /> Last Saved Configuration
                        </h4>
                        <pre className="mt-2 text-xs text-green-600/80 overflow-auto">
                            {JSON.stringify(lastSaved, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </>
    );
}
