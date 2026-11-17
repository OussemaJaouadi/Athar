import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, FlaskConical, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Desk, DeskBar, DeskItem, DeskPane, Fields, deskBtn, useDeskKeys } from '@/components/athar/desk'
import { AddKeyPane } from '@/components/athar/key-form'
import { HoldToRemove, KeyNote } from '@/components/athar/key-ui'
import { labTime } from '@/components/athar/lab'
import { PROVIDER_NAME } from '#/shared/key-models'
import { isProvider } from '#/shared/providers'
import { deleteKey, listKeyRows, retestKey, type KeyRow } from '#/server/api/keys'

const ADD = 'add'
type Search = { key?: string }

export const Route = createFileRoute('/portal/keys')({
  validateSearch: (s: Record<string, unknown>): Search => ({ key: typeof s.key === 'string' && s.key ? s.key : undefined }),
  loader: () => listKeyRows(),
  component: KeysPage,
})

const providerName = (p: string) => (isProvider(p) ? PROVIDER_NAME[p] : p)
const lastTest = (k: KeyRow) => (k.last_tested_at ? `${k.last_test_ok === 1 ? 'passed' : 'failed'} ${labTime(k.last_tested_at)}` : 'never tested')

function KeysPage() {
  const keys = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/keys' })
  // "Add a key" is the first item; with no keys it is the only one and it is selected.
  const ids = [ADD, ...keys.map((k) => k.id)]
  const current = search.key && ids.includes(search.key) ? search.key : (keys[0]?.id ?? ADD)
  const selected = keys.find((k) => k.id === current)
  const select = useCallback((id: string) => navigate({ search: { key: id }, replace: true }), [navigate])
  useDeskKeys({ ids, current, select })

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Keys" facts={keys.length ? `${keys.length} ${keys.length === 1 ? 'key' : 'keys'} · no engine uses a key yet` : 'No keys yet'} />
      <Desk
        storageKey="keys"
        showPaneOnNarrow={!!search.key}
        onBack={() => navigate({ search: {}, replace: true })}
        backLabel="All keys"
        list={
          <div role="list" aria-label="Keys">
            <div role="listitem">
              <DeskItem
                selected={current === ADD}
                onSelect={() => select(ADD)}
                lead={<Plus className="size-4 shrink-0 text-ink" aria-hidden />}
                title="Add a key"
                detail="Tested with its provider before it is saved"
              />
            </div>
            {keys.map((k) => (
              <div role="listitem" key={k.id}>
                <DeskItem
                  selected={k.id === current}
                  onSelect={() => select(k.id)}
                  title={k.name}
                  qualifier={providerName(k.provider)}
                  detail={`${k.model} · ${lastTest(k)}`}
                />
              </div>
            ))}
          </div>
        }
        pane={
          selected ? (
            <KeyPane key={selected.id} k={selected} position={`${keys.indexOf(selected) + 1} of ${keys.length}`} onRemoved={() => select(ADD)} />
          ) : (
            <AddKeyPane key="add" onSaved={select} />
          )
        }
      />
    </main>
  )
}

function KeyPane({ k, position, onRemoved }: { k: KeyRow; position: string; onRemoved: () => void }) {
  const router = useRouter()
  const [testing, setTesting] = useState(false)
  const [fresh, setFresh] = useState<{ ok: boolean; message: string }>()
  const [removeError, setRemoveError] = useState<string>()
  const result = fresh ?? (k.last_tested_at ? { ok: k.last_test_ok === 1, message: k.last_test_message ?? '' } : undefined)
  const Icon = result?.ok ? CircleCheck : CircleAlert

  return (
    <DeskPane
      title={k.name}
      statement="No engine uses a key yet."
      position={position}
      foot={
        <>
          <button
            type="button"
            disabled={testing}
            className={deskBtn}
            onClick={async () => {
              setTesting(true)
              try {
                setFresh(await retestKey({ data: k.id }))
                await router.invalidate()
              } catch (e) {
                setFresh({ ok: false, message: e instanceof Error ? e.message : String(e) })
              } finally {
                setTesting(false)
              }
            }}
          >
            {testing ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical aria-hidden />}
            {testing ? 'Testing…' : 'Test key'}
          </button>
          <HoldToRemove
            label={k.name}
            onConfirm={async () => {
              setRemoveError(undefined)
              try {
                await deleteKey({ data: k.id })
                await router.invalidate()
                onRemoved()
              } catch (e) {
                setRemoveError(e instanceof Error ? e.message : String(e))
              }
            }}
          />
          {removeError && <KeyNote ok={false}>Could not remove: {removeError.replace(/[.\s]+$/, '')}.</KeyNote>}
        </>
      }
    >
      <Fields
        fields={[
          { label: 'Name', value: k.name },
          { label: 'Provider', value: providerName(k.provider) },
          { label: 'Model', value: k.model, mono: true },
          { label: 'Key', value: k.hint, mono: true },
          { label: 'Added', value: labTime(k.created_at) },
          {
            label: 'Last tested',
            value: result ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-4 shrink-0" aria-hidden />
                {result.ok ? 'Passed' : 'Failed'}
                {fresh ? ' · just now' : k.last_tested_at ? ` · ${labTime(k.last_tested_at)}` : ''}
              </span>
            ) : (
              'Never tested'
            ),
          },
          ...(result && !result.ok && result.message ? [{ label: 'Provider said', value: result.message }] : []),
          ...(k.calls ? [{ label: 'Used', value: `${k.calls.toLocaleString('en-GB')} calls · ${k.tokens.toLocaleString('en-GB')} tokens` }] : []),
        ]}
      />
    </DeskPane>
  )
}
