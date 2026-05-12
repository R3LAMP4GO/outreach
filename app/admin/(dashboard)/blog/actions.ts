"use server";

import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function fetchBlogPosts() {
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
}

export async function createBlogPost(formData: {
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
}) {
  await db.insert(blogPosts).values({
    title: formData.title,
    slug: formData.slug,
    category: formData.category,
    description: formData.description,
    tldr: formData.tldr,
    content: formData.content,
    image: formData.image,
    readTime: formData.readTime,
    authorName: formData.authorName,
    authorUrl: formData.authorUrl,
    published: formData.published,
    datePublished: new Date().toISOString(),
  });
}

export async function updateBlogPost(
  id: string,
  formData: {
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
  },
) {
  await db
    .update(blogPosts)
    .set({
      title: formData.title,
      slug: formData.slug,
      category: formData.category,
      description: formData.description,
      tldr: formData.tldr,
      content: formData.content,
      image: formData.image,
      readTime: formData.readTime,
      authorName: formData.authorName,
      authorUrl: formData.authorUrl,
      published: formData.published,
    })
    .where(eq(blogPosts.id, id));
}

export async function deleteBlogPost(id: string) {
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

export async function toggleBlogPostPublish(
  id: string,
  published: boolean,
  datePublished: string | null,
) {
  const newPublished = !published;
  await db
    .update(blogPosts)
    .set({
      published: newPublished,
      datePublished:
        newPublished && !datePublished ? new Date().toISOString() : (datePublished ?? undefined),
    })
    .where(eq(blogPosts.id, id));
}
