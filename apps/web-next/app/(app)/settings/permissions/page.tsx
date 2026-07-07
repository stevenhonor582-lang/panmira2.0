import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function Page() {
  return (
    <PagePlaceholder
      title="权限"
      description="RBAC · 角色 · 资源授权"
      module="系统设置 (Settings)"
      route="/settings/permissions"
    />
  );
}
