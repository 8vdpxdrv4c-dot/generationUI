"use client";

import { useConversationAgent } from "@/hooks/use-conversation-agent";
import { ArrowRight } from "lucide-react";
import { SEED_TEMPLATES } from "@/components/template-library/seed-templates";
import { TemplateCard } from "@/components/template-library/template-card";
import { focusReferenceComposer } from "@/components/template-library/focus-composer";
import { mergeReferences, referenceKind, type UIReference } from "@/components/template-library/types";

export function HomeTemplateGallery({ onOpenLibrary, threadId }: { onOpenLibrary: () => void; threadId?: string }) {
  const { agent, isReady } = useConversationAgent({ threadId });
  const savedTemplates = (agent.state?.templates ?? []) as UIReference[];
  const pending = agent.state?.pending_template as { id: string; name: string } | null | undefined;

  const templates = mergeReferences(SEED_TEMPLATES, savedTemplates).filter((item) => referenceKind(item) === "page");

  const applyTemplate = (id: string) => {
    if (!isReady) return;
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    agent.setState({
      ...agent.state,
      templates: savedTemplates.some((item) => item.id === id) ? savedTemplates : [...savedTemplates, template],
      pending_template: { id: template.id, name: template.name, kind: "page" },
    });
    focusReferenceComposer();
  };

  return (
    <section className="home-template-gallery" id="home-template-gallery" aria-labelledby="home-template-title">
      <div className="home-gallery-heading">
        <div>
          <p className="home-gallery-eyebrow">选择模板后，在上方输入要求并发送生成 UI</p>
          <h2 id="home-template-title">模板推荐</h2>
        </div>
        <button className="home-gallery-more" type="button" onClick={onOpenLibrary}>
          全部模板 <ArrowRight size={15} />
        </button>
      </div>
      {templates.length ? (
        <div className="home-template-track">
          {templates.map((template) => (
            <div className="home-template-item" key={template.id}>
              <TemplateCard
                id={template.id}
                name={template.name}
                description={template.description}
                html={template.html}
                componentType={template.component_type}
                componentData={template.component_data}
                dataDescription={template.data_description}
                version={template.version}
                previewWidth={template.preview_width}
                previewHeight={template.preview_height}
                selected={pending?.id === template.id}
                applyDisabled={!isReady}
                onApply={applyTemplate}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="home-gallery-empty">还没有模板，生成并保存一个可视化后，它会出现在这里。</p>
      )}
    </section>
  );
}
