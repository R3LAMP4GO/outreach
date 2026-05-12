"use client";

import * as React from "react";
import { IconTrash, IconLoader2 } from "@tabler/icons-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/ui/alert-dialog";
import { Button } from "@/components/shadcn/ui/button";

export interface DeleteConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The type of item being deleted (e.g., "Schedule", "Campaign", "Contact") */
  title: string;
  /** The name of the specific item being deleted */
  itemName?: string;
  /** Custom description (optional - defaults to standard warning) */
  description?: string;
  /** Callback when delete is confirmed */
  onConfirm: () => void | Promise<void>;
  /** Whether the delete action is in progress */
  loading?: boolean;
  /** Custom delete button text */
  deleteText?: string;
}

/**
 * A reusable delete confirmation dialog with nice styling.
 *
 * @example
 * ```tsx
 * <DeleteConfirmDialog
 *   open={showDelete}
 *   onOpenChange={setShowDelete}
 *   title="Delete Schedule"
 *   itemName={schedule.name}
 *   onConfirm={handleDelete}
 *   loading={deleting}
 * />
 * ```
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  itemName,
  description,
  onConfirm,
  loading = false,
  deleteText = "Delete",
}: DeleteConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    if (!loading) {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader className="sm:text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <IconTrash className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>

          {/* Title */}
          <AlertDialogTitle className="text-xl font-semibold text-center">{title}</AlertDialogTitle>

          {/* Description */}
          <AlertDialogDescription className="text-center text-muted-foreground pt-2">
            {description ? (
              description
            ) : (
              <>
                {itemName ? (
                  <>
                    Are you sure you want to delete{" "}
                    <span className="font-medium text-foreground">&quot;{itemName}&quot;</span>?
                  </>
                ) : (
                  "Are you sure you want to delete this item?"
                )}
                <span className="block mt-2 text-sm">This action cannot be undone.</span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-6 sm:justify-center gap-3">
          {/* Cancel Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="min-w-[100px] shadow-sm hover:shadow-md transition-shadow"
          >
            Cancel
          </Button>

          {/* Delete Button */}
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
            className="min-w-[100px] shadow-md hover:shadow-lg transition-shadow bg-red-600 hover:bg-red-700"
          >
            {loading ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              deleteText
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
