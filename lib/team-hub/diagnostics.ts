// Log only fixed categories and known error codes. Driver messages, stacks and
// connection options can contain credentials or source data and stay private.
const categories:Record<string,string>={
  SELF_SIGNED_CERT_IN_CHAIN:"tls_certificate",DEPTH_ZERO_SELF_SIGNED_CERT:"tls_certificate",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY:"tls_certificate",UNABLE_TO_VERIFY_LEAF_SIGNATURE:"tls_certificate",
  CERT_HAS_EXPIRED:"tls_certificate",ERR_TLS_CERT_ALTNAME_INVALID:"tls_certificate",
  "28P01":"authentication","28000":"authentication","42501":"permission",
  "42P01":"schema","3F000":"schema",ENOTFOUND:"network",EAI_AGAIN:"network",
  ECONNREFUSED:"network",ENETUNREACH:"network",ECONNRESET:"network",ETIMEDOUT:"timeout",
};
export function teamHubDiagnostic(error:unknown){
  const code=error&&typeof error==="object"&&"code" in error?error.code:null;
  return typeof code==="string"&&Object.hasOwn(categories,code)
    ?{category:categories[code],code}:{category:"unknown",code:"unknown"};
}
