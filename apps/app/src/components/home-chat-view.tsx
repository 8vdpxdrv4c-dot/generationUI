"use client";

import type { ComponentProps } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";

type ChatViewProps = ComponentProps<typeof CopilotChat.View>;

function isUploadedAttachment(attachment: NonNullable<ChatViewProps["attachments"]>[number]) {
  const path = attachment.metadata?.uploadPath;
  return typeof path === "string" && path.startsWith("/upload/");
}

export const HomeChatView = Object.assign((props: ChatViewProps) => {
  const handleSubmitMessage = (value: string) => {
    const readyAttachments = (props.attachments ?? []).filter(
      (attachment) => attachment.status === "ready",
    );
    const uploadedFiles = [...new Map(
      readyAttachments
        .map((attachment) => {
          const path = attachment.metadata?.uploadPath;
          if (typeof path !== "string" || !path.startsWith("/upload/")) return null;

          // The upload API normally supplies uploadUrl. Keep the path usable
          // when an attachment provider only preserves metadata.uploadPath.
          const metadataUrl = attachment.metadata?.uploadUrl;
          const url = typeof metadataUrl === "string" && metadataUrl.length > 0
            ? metadataUrl
            : new URL(path, window.location.origin).toString();
          return { path, url };
        })
        .filter((file): file is { path: string; url: string } => file !== null)
        .map((file) => [file.path, file] as const),
    ).values()];
    const message = uploadedFiles.length
      ? `${value.trim()}${value.trim() ? "\n\n" : ""}已上传文件（路径 / 访问地址）：\n${uploadedFiles.map((file) => `- ${file.path} | ${file.url}`).join("\n")}`
      : value;

    // The uploaded files are browser assets, not multimodal inputs. Passing
    // their localhost URLs as attachments makes the model try to download
    // them, and sending images as data creates an unnecessarily large prompt.
    // Keep only their paths in the text prompt and remove them from the
    // multimodal payload before submitting.
    const modelAttachmentIds = readyAttachments
      .filter(isUploadedAttachment)
      .map((attachment) => attachment.id);
    modelAttachmentIds.forEach((id) => props.onRemoveAttachment?.(id));

    const submit = () => props.onSubmitMessage?.(message);
    if (modelAttachmentIds.length > 0 && props.onRemoveAttachment) setTimeout(submit, 0);
    else submit();
  };

  return <CopilotChat.View {...props} onSubmitMessage={handleSubmitMessage} />;
}, CopilotChat.View);
