import { type ReactNode } from "react";
import { RECOMMENDED } from "../rules.js";
import { Select } from "./Select.js";
import type { TuningForm } from "./useTuningForm.js";
import { Row, NumberField } from "./fields.js";

export function renderModelWindowPanel(form: TuningForm) {
  const {
    targetKey, contextWindow, maxTokens, setContextWindow, setMaxTokens,
    models, targetOptions, scoped, scopedEditable, mixedValues,
    modelEditable, isGroup, sample, touch, chooseTarget,
  } = form;
  let scopeNote: ReactNode
  if (isGroup) {
    scopeNote = (
      <>
        将统一写入 {scopedEditable.length} 个模型
        {scoped.length > scopedEditable.length ? `，跳过 ${scoped.length - scopedEditable.length} 个只读模型` : ''}
        {mixedValues ? '。这些模型当前的值不一致，输入框显示的是其中一个模型的值' : ''}
      </>
    )
  } else if (sample !== undefined && sample.editable) {
    scopeNote = (
      <>
        保存到 <span className="dsh-cc-mono">{sample.entryId}</span>
        {sample.strategy === 'models' ? ' 的 models 列表' : ' 的 modelOverrides'}
      </>
    )
  }

  return (
    <section className="dsh-cc-section">
      {models.length === 0 ? (
        <p className="dsh-cc-warn">当前没有可用的模型，无法读取最大上下文。</p>
      ) : (
        <div className="dsh-cc-rows">
          <Row label="应用范围" hint={scopeNote}>
            <Select ariaLabel="应用范围" value={targetKey} onChange={chooseTarget} options={targetOptions} />
          </Row>
          <Row label="最大上下文" hint={`模型一次可接收的内容量，推荐 ${RECOMMENDED.contextWindow}`} htmlFor="dsh-cc-window">
            <NumberField
              id="dsh-cc-window"
              unit="tokens"
              min={1}
              step={1000}
              value={contextWindow}
              disabled={!modelEditable}
              onChange={(value) => {
                setContextWindow(value)
                touch()
              }}
            />
          </Row>
          <Row label="输出预留" hint={`为模型回复预留的空间，推荐 ${RECOMMENDED.maxTokens}`} htmlFor="dsh-cc-reserve">
            <NumberField
              id="dsh-cc-reserve"
              unit="tokens"
              min={1}
              step={1000}
              value={maxTokens}
              disabled={!modelEditable}
              onChange={(value) => {
                setMaxTokens(value)
                touch()
              }}
            />
          </Row>
          {!modelEditable && (
            <p className="dsh-cc-warn">所选模型不在当前 profile 的可编辑条目中，最大上下文只读。</p>
          )}
        </div>
      )}
    </section>
  );
}
