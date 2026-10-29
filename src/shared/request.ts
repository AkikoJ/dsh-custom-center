/** Value of the marker header the browser half sends with every library request. */
export const MARKER_HEADER = 'x-dsh-custom-center'

/**
 * Whether a socket's remote address is the local machine.
 * @param address - `socket.remoteAddress`.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  const plain = address.startsWith('::ffff:') ? address.slice(7) : address
  return plain === '::1' || /^127(\.\d{1,3}){3}$/.test(plain)
}
