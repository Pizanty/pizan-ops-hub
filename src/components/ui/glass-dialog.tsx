"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogPortal,
  DialogTrigger,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";

const GlassDialog = Dialog;
const GlassDialogTrigger = DialogTrigger;
const GlassDialogClose = DialogClose;
const GlassDialogDescription = DialogDescription;

const GlassDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/70 backdrop-blur-md",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
GlassDialogOverlay.displayName = "GlassDialogOverlay";

type GlassDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: "md" | "lg" | "xl";
};

const sizeMap: Record<NonNullable<GlassDialogContentProps["size"]>, string> = {
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

const GlassDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  GlassDialogContentProps
>(({ className, children, size = "lg", ...props }, ref) => (
  <DialogPortal>
    <GlassDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
        sizeMap[size],
        "max-h-[85vh] overflow-hidden",
        "rounded-xl border border-white/10",
        "bg-card/70 backdrop-blur-xl backdrop-saturate-150",
        "shadow-elegant",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-transparent before:via-primary before:to-transparent",
        "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "flex flex-col",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
GlassDialogContent.displayName = "GlassDialogContent";

const GlassDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "shrink-0 border-b border-white/10 px-6 py-4",
      className,
    )}
    {...props}
  />
);
GlassDialogHeader.displayName = "GlassDialogHeader";

const GlassDialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex-1 overflow-y-auto px-6 py-5", className)}
    {...props}
  />
);
GlassDialogBody.displayName = "GlassDialogBody";

const GlassDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "shrink-0 flex flex-col-reverse gap-2 border-t border-white/10 px-6 py-4 sm:flex-row sm:justify-end sm:gap-2",
      className,
    )}
    {...props}
  />
);
GlassDialogFooter.displayName = "GlassDialogFooter";

const GlassDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-lg font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
GlassDialogTitle.displayName = "GlassDialogTitle";

export {
  GlassDialog,
  GlassDialogTrigger,
  GlassDialogClose,
  GlassDialogOverlay,
  GlassDialogContent,
  GlassDialogHeader,
  GlassDialogBody,
  GlassDialogFooter,
  GlassDialogTitle,
  GlassDialogDescription,
};
