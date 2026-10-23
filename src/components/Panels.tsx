import { useApp } from "../context";
import { Drawer } from "./Primitives";
import { CageDetail, MouseDetail, LitterDetail } from "./Details";
import {
  MouseForm,
  CageForm,
  CleanForm,
  PlanForm,
  TransferForm,
  CareForm,
} from "./ManagementForms";
import {
  BreedingForm,
  BreedingUpdateForm,
  LitterForm,
  LitterEdit,
} from "./BreedingForms";
import { SettingsPanel, AppearanceForm } from "./Settings";
import {
  ArchiveForm,
  BreedingStop,
  CarePanel,
  CleaningCorrection,
  OccurrenceDetail,
  Reminders,
  SnoozeForm,
} from "./TaskPanels";
const titles: Record<string, string> = {
  cage: "小窝档案",
  mouse: "鼠鼠档案",
  litter: "窝次与成长",
  mouseForm: "小鼠档案",
  cageForm: "笼位资料",
  clean: "记录换笼",
  plan: "换笼计划",
  transfer: "转笼",
  wean: "实际断奶",
  careForm: "照护记录",
  breedingForm: "登记配种",
  breedingUpdate: "繁育节点",
  litterForm: "登记一窝",
  litterEdit: "更正窝次",
  settings: "小窝设置",
  appearance: "形象工作室",
  archive: "去向与归档",
  breedingStop: "繁殖资格",
  care: "今日照护",
  cleaningCorrect: "更正换笼记录",
  occurrence: "本次换笼",
  reminders: "提醒",
  snooze: "稍后提醒",
};
export function Panels() {
  const { stack } = useApp();
  return (
    <>
      {stack.map((panel, index) => (
        <PanelLayer
          key={`${panel.kind}:${panel.id || ""}:${index}`}
          panel={panel}
        />
      ))}
    </>
  );
}
function PanelLayer({
  panel,
}: {
  panel: ReturnType<typeof useApp>["stack"][number];
}) {
  const { stack, state } = useApp();
  const { kind, id, data } = panel;
  if (
    ["mouse", "mouseForm", "appearance", "breedingStop"].includes(kind) &&
    id &&
    !state.mice.some((m) => m.id === id)
  )
    return null;
  let content;
  switch (kind) {
    case "cage":
      content = <CageDetail id={id!} />;
      break;
    case "mouse":
      content = <MouseDetail id={id!} />;
      break;
    case "litter":
      content = <LitterDetail id={id!} />;
      break;
    case "mouseForm":
      content = <MouseForm id={id} />;
      break;
    case "cageForm":
      content = <CageForm id={id} />;
      break;
    case "clean":
      content = <CleanForm data={data} />;
      break;
    case "plan":
      content = <PlanForm data={data} />;
      break;
    case "transfer":
      content = <TransferForm data={data} />;
      break;
    case "wean":
      content = <TransferForm data={data} wean />;
      break;
    case "careForm":
      content = <CareForm data={data} />;
      break;
    case "breedingForm":
      content = <BreedingForm data={data} />;
      break;
    case "breedingUpdate":
      content = <BreedingUpdateForm id={id!} data={data} />;
      break;
    case "litterForm":
      content = <LitterForm data={data} />;
      break;
    case "litterEdit":
      content = <LitterEdit id={id!} />;
      break;
    case "settings":
      content = <SettingsPanel />;
      break;
    case "appearance":
      content = <AppearanceForm id={id!} />;
      break;
    case "archive":
      content = <ArchiveForm id={id!} data={data!} />;
      break;
    case "breedingStop":
      content = <BreedingStop id={id!} />;
      break;
    case "care":
      content = <CarePanel />;
      break;
    case "cleaningCorrect":
      content = <CleaningCorrection id={id!} />;
      break;
    case "occurrence":
      content = <OccurrenceDetail id={id!} />;
      break;
    case "reminders":
      content = <Reminders initial={data?.tab} />;
      break;
    case "snooze":
      content = <SnoozeForm id={id!} />;
      break;
    default:
      content = null;
  }
  return (
    <Drawer
      title={titles[kind] || "小窝"}
      wide={["mouse", "litter", "cage"].includes(kind)}
    >
      {content}
    </Drawer>
  );
}
