$ErrorActionPreference = "Stop"

$target = "https://api.x.com/"
$proxy = [System.Net.WebRequest]::DefaultWebProxy.GetProxy($target).AbsoluteUri
if ($proxy -and $proxy -ne $target) {
  $env:NODE_USE_ENV_PROXY = "1"
  $env:HTTPS_PROXY = $proxy
  $env:HTTP_PROXY = $proxy
}

node .\scripts\backtest.mjs
