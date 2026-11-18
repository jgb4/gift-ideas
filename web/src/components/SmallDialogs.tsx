import { useEffect, useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export type Confirm = { title: string; description?: string; action: string; run: () => void }

export function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  return (
    <AlertDialog open={!!confirm} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          {confirm?.description && <AlertDialogDescription>{confirm.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { confirm?.run(); onClose() }}>{confirm?.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type AddProps = { open: boolean; onClose: () => void; onAdd: (name: string) => void }

export function AddPersonDialog({ open, onClose, onAdd }: AddProps) {
  const [name, setName] = useState("")
  useEffect(() => { if (open) setName("") }, [open])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add person</DialogTitle></DialogHeader>
        <form id="add-person" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd(name.trim()) }}>
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-person" disabled={!name.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
