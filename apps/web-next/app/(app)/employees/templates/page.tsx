import { redirect } from "next/navigation";

// R52-FRONTEND: 旧 /employees/templates 路由 → 跳到新的 /hr 数字HR 库
export default function Page() {
  redirect("/hr");
}
