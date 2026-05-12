"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IconTag, IconX, IconPencil, IconTrash } from "@tabler/icons-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/shadcn/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/ui/popover";
import { Badge } from "@/components/shadcn/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "@/components/shadcn/ui/button";

type CampaignTagsInputProps = {
  campaignId: string;
  currentTags: string[];
  onTagsChange?: (tags: string[]) => void;
};

export function CampaignTagsInput({
  campaignId,
  currentTags,
  onTagsChange,
}: CampaignTagsInputProps) {
  const [open, setOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags || []);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagValue, setEditTagValue] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchAvailableTags = async () => {
    try {
      const response = await fetch("/api/outreach/campaigns/tags");
      if (!response.ok) throw new Error("Failed to fetch tags");
      const data = await response.json();
      setAvailableTags(data.tags || []);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  useEffect(() => {
    fetchAvailableTags();
  }, []);

  useEffect(() => {
    setSelectedTags(currentTags || []);
  }, [currentTags]);

  const handleAddTag = async (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (!trimmedTag) return;

    if (selectedTags.includes(trimmedTag)) {
      toast.error("Tag already added");
      return;
    }

    const newTags = [...selectedTags, trimmedTag];
    setSelectedTags(newTags);
    setSearchValue("");
    await updateCampaignTags(newTags);

    if (!availableTags.includes(trimmedTag)) {
      setAvailableTags([...availableTags, trimmedTag]);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const newTags = selectedTags.filter((tag) => tag !== tagToRemove);
    setSelectedTags(newTags);
    await updateCampaignTags(newTags);
  };

  const handleEditTag = async (oldTag: string) => {
    const newTag = editTagValue.trim().toLowerCase();
    if (!newTag || newTag === oldTag) {
      setEditingTag(null);
      return;
    }

    if (selectedTags.includes(newTag)) {
      toast.error("Tag already exists");
      return;
    }

    const newTags = selectedTags.map((tag) => (tag === oldTag ? newTag : tag));
    setSelectedTags(newTags);
    setEditingTag(null);
    setEditTagValue("");
    await updateCampaignTags(newTags);
  };

  const updateCampaignTags = async (tags: string[]) => {
    try {
      const response = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });

      if (!response.ok) throw new Error("Failed to update tags");
      toast.success("Tags updated");
      onTagsChange?.(tags);
    } catch (error) {
      console.error("Error updating tags:", error);
      toast.error("Failed to update tags");
    }
  };

  const filteredTags = availableTags
    .filter((tag) => !selectedTags.includes(tag))
    .filter((tag) => (searchValue ? tag.toLowerCase().includes(searchValue.toLowerCase()) : true));

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className="w-full min-h-[44px] px-3 py-2 text-left bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen(!open);
              }
            }}
          >
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1.5 pr-1.5 py-1 text-sm bg-blue-50 text-blue-700 border border-blue-200 [&>svg]:!size-4"
                >
                  <IconTag />
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTag(tag);
                    }}
                    className="ml-0.5 hover:bg-blue-200 p-0.5 rounded-full"
                  >
                    <IconX className="!h-4 !w-4" />
                  </button>
                </Badge>
              ))}
              {selectedTags.length === 0 && <span className="text-gray-400">Tags</span>}
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          align="start"
          sideOffset={2}
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          <Command>
            <CommandInput
              placeholder="Search or create tag..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              {searchValue && (
                <CommandItem
                  onSelect={() => {
                    setEditTagValue(searchValue);
                    setTagDescription("");
                    setIsCreating(true);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  Create new tag &quot;{searchValue}&quot;
                </CommandItem>
              )}
              {selectedTags.length > 0 && (
                <CommandGroup heading="Selected Tags">
                  {selectedTags.map((tag) => (
                    <div
                      key={tag}
                      className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-100"
                    >
                      <div className="flex items-center">
                        <IconTag className="mr-2 h-4 w-4" />
                        <span className="text-base">{tag}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTag(tag);
                            setEditTagValue(tag);
                            setOpen(false);
                          }}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="Edit tag"
                        >
                          <IconPencil className="h-4 w-4 text-gray-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTag(tag);
                          }}
                          className="p-1 hover:bg-red-100 rounded"
                          title="Delete tag"
                        >
                          <IconTrash className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </CommandGroup>
              )}
              {filteredTags.length > 0 && (
                <CommandGroup heading="Available Tags">
                  {filteredTags.map((tag) => (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => {
                        handleAddTag(tag);
                        setOpen(false);
                      }}
                      className="cursor-pointer text-base"
                    >
                      <IconTag className="mr-2 h-4 w-4" />
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!searchValue && filteredTags.length === 0 && selectedTags.length === 0 && (
                <CommandEmpty>No tags available</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog
        open={!!editingTag || isCreating}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTag(null);
            setIsCreating(false);
            setEditTagValue("");
            setTagDescription("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isCreating ? "Create Tag" : "Edit Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-label">Label</Label>
              <Input
                id="tag-label"
                value={editTagValue}
                onChange={(e) => setEditTagValue(e.target.value)}
                placeholder="Enter tag name"
                className="bg-gray-50 border border-gray-300 shadow-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (isCreating) {
                      handleAddTag(editTagValue);
                      setIsCreating(false);
                      setEditTagValue("");
                      setTagDescription("");
                    } else if (editingTag) {
                      handleEditTag(editingTag);
                    }
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-description">Description</Label>
              <Input
                id="tag-description"
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                placeholder="Optional description"
                className="bg-gray-50 border border-gray-300 shadow-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingTag(null);
                setIsCreating(false);
                setEditTagValue("");
                setTagDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (isCreating) {
                  handleAddTag(editTagValue);
                  setIsCreating(false);
                  setEditTagValue("");
                  setTagDescription("");
                } else if (editingTag) {
                  handleEditTag(editingTag);
                }
              }}
            >
              {isCreating ? "Create" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
