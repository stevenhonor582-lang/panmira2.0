// R14-E: /optimization 已并入 /diagnosis(优化建议跟不健康项联动)
// 保留路由避免历史书签 404,内容重定向到 /overview/diagnosis
import { redirect } from "next/navigation";

export default function OptimizationPage(): never {
  redirect("/overview/diagnosis");
}
