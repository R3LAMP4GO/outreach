"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  toggleBlogPostPublish,
} from "./actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/ui/table";
import { Button } from "@/components/shadcn/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shadcn/ui/alert-dialog";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Badge } from "@/components/shadcn/ui/badge";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconLoader2,
} from "@tabler/icons-react";

// BlogPost type matching the Drizzle schema
interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  content: string;
  image: string;
  published: boolean;
  datePublished: string | null;
  createdAt: string;
  updatedAt: string;
  readTime: string | null;
  authorName: string;
  authorUrl: string | null;
  tldr: string | null;
  tags: string[] | null;
}

interface BlogFormData {
  title: string;
  slug: string;
  category: string;
  description: string;
  tldr: string;
  content: string;
  image: string;
  readTime: string;
  authorName: string;
  authorUrl: string;
  published: boolean;
}

const emptyFormData: BlogFormData = {
  title: "",
  slug: "",
  category: "",
  description: "",
  tldr: "",
  content: "",
  image: "",
  readTime: "",
  authorName: "",
  authorUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://__YOUR_DOMAIN__"}/about`,
  published: false,
};

export default function BlogManagementPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [formData, setFormData] = useState<BlogFormData>(emptyFormData);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBlogPosts();
      setPosts(data as BlogPost[]);
    } catch (error) {
      console.error("Error fetching posts:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBlogPosts()
      .then((data) => {
        if (!cancelled) {
          setPosts(data as BlogPost[]);
        }
      })
      .catch((error) => {
        console.error("Error fetching posts:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleFormChange = (field: keyof BlogFormData, value: string | boolean) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "title" && !editingPost) {
        updated.slug = generateSlug(value as string);
      }
      return updated;
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createBlogPost(formData);
      setIsCreateOpen(false);
      setFormData(emptyFormData);
      loadPosts();
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Error creating post: " + (error instanceof Error ? error.message : String(error)));
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingPost) return;
    setSaving(true);
    try {
      await updateBlogPost(editingPost.id, formData);
      setEditingPost(null);
      setFormData(emptyFormData);
      loadPosts();
    } catch (error) {
      console.error("Error updating post:", error);
      alert("Error updating post: " + (error instanceof Error ? error.message : String(error)));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBlogPost(id);
      loadPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Error deleting post: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleTogglePublish = async (post: BlogPost) => {
    try {
      await toggleBlogPostPublish(post.id, post.published, post.datePublished);
      loadPosts();
    } catch (error) {
      console.error("Error toggling publish:", error);
    }
  };

  const openEdit = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      slug: post.slug,
      category: post.category || "",
      description: post.description || "",
      tldr: post.tldr || "",
      content: post.content || "",
      image: post.image || "",
      readTime: post.readTime || "",
      authorName: post.authorName || "",
      authorUrl: post.authorUrl || "",
      published: post.published || false,
    });
  };

  // Form fields as JSX to avoid recreation on each render
  const formFieldsJSX = (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="title" className="text-right text-foreground">
          Title
        </Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => handleFormChange("title", e.target.value)}
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="slug" className="text-right text-foreground">
          Slug
        </Label>
        <Input
          id="slug"
          value={formData.slug}
          onChange={(e) => handleFormChange("slug", e.target.value)}
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="category" className="text-right text-foreground">
          Category
        </Label>
        <Input
          id="category"
          value={formData.category}
          onChange={(e) => handleFormChange("category", e.target.value)}
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="description" className="text-right text-foreground">
          Description
        </Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleFormChange("description", e.target.value)}
          className="col-span-3"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="tldr" className="text-right text-foreground">
          TL;DR
        </Label>
        <Textarea
          id="tldr"
          value={formData.tldr}
          onChange={(e) => handleFormChange("tldr", e.target.value)}
          className="col-span-3"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="content" className="text-right text-foreground">
          Content
        </Label>
        <Textarea
          id="content"
          value={formData.content}
          onChange={(e) => handleFormChange("content", e.target.value)}
          className="col-span-3"
          rows={6}
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="image" className="text-right text-foreground">
          Image URL
        </Label>
        <Input
          id="image"
          value={formData.image}
          onChange={(e) => handleFormChange("image", e.target.value)}
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="readTime" className="text-right text-foreground">
          Read Time
        </Label>
        <Input
          id="readTime"
          value={formData.readTime}
          onChange={(e) => handleFormChange("readTime", e.target.value)}
          placeholder="5 min read"
          className="col-span-3"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="authorName" className="text-right text-foreground">
          Author
        </Label>
        <Input
          id="authorName"
          value={formData.authorName}
          onChange={(e) => handleFormChange("authorName", e.target.value)}
          className="col-span-3"
        />
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Blog Management</h1>
          <p className="text-muted-foreground">Create and manage your blog posts</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData(emptyFormData)} className="text-primary-foreground">
              <IconPlus className="w-4 h-4 mr-2" />
              New Post
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Post</DialogTitle>
              <DialogDescription>Fill in the details for your new blog post.</DialogDescription>
            </DialogHeader>
            {formFieldsJSX}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Post
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <IconLoader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No blog posts yet. Create your first post!
        </div>
      ) : (
        <div className="border rounded overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-card">
              <TableRow className="hover:bg-transparent border-b">
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium text-foreground">{post.title}</TableCell>
                  <TableCell className="text-foreground">{post.category || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={post.published ? "default" : "secondary"}>
                      {post.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground">
                    {post.datePublished ? new Date(post.datePublished).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTogglePublish(post)}
                        title={post.published ? "Unpublish" : "Publish"}
                        className="text-foreground"
                      >
                        {post.published ? (
                          <IconEyeOff className="w-4 h-4" />
                        ) : (
                          <IconEye className="w-4 h-4" />
                        )}
                      </Button>

                      <Dialog
                        open={editingPost?.id === post.id}
                        onOpenChange={(open) => !open && setEditingPost(null)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(post)}
                            className="text-foreground"
                          >
                            <IconPencil className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit Post</DialogTitle>
                            <DialogDescription>
                              Update the details of your blog post.
                            </DialogDescription>
                          </DialogHeader>
                          {formFieldsJSX}
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setEditingPost(null)}>
                              Cancel
                            </Button>
                            <Button onClick={handleUpdate} disabled={saving}>
                              {saving && <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />}
                              Save Changes
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-foreground">
                            <IconTrash className="w-4 h-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Post</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{post.title}&quot;? This action
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(post.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
