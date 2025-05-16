// src/content/config.ts
import { defineCollection, reference, z } from "astro:content";

const postsCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    // Add other frontmatter fields here
    layout: reference("layout"),
    pubDate: z.coerce.date(),  // Reference a layout component
  }),
});


export const collections = {
  posts: postsCollection,
};