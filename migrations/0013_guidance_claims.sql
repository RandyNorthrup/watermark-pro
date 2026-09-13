CREATE TABLE `guidance_claim` (
  `user_id` text NOT NULL,
  `topic` text NOT NULL,
  `claimed_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `topic`),
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
