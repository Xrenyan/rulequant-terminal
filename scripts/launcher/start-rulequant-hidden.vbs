Option Explicit

Dim fso, shell, env, root, nodePath, nextPath, serverPath, url, command, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("PROCESS")

root = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = root & "\runtime\node\node.exe"
nextPath = root & "\node_modules\next\dist\bin\next"
serverPath = root & "\.next\standalone\server.js"
url = "http://127.0.0.1:3030/dashboard"

If Not fso.FileExists(nodePath) Then
  MsgBox "Bundled node.exe was not found:" & vbCrLf & nodePath, vbCritical, "RuleQuant start failed"
  WScript.Quit 1
End If

If Not fso.FileExists(nextPath) And Not fso.FileExists(serverPath) Then
  MsgBox "RuleQuant runtime files were not found." & vbCrLf & "Missing next start and standalone server.", vbCritical, "RuleQuant start failed"
  WScript.Quit 1
End If

If Not HttpOk(url) Then
  If fso.FileExists(nextPath) Then
    shell.CurrentDirectory = root
    command = """" & nodePath & """ """ & nextPath & """ start -p 3030 -H 127.0.0.1"
  Else
    env("PORT") = "3030"
    env("HOSTNAME") = "127.0.0.1"
    shell.CurrentDirectory = root & "\.next\standalone"
    command = """" & nodePath & """ """ & serverPath & """"
  End If
  shell.Run command, 0, False
End If

For i = 1 To 40
  If HttpOk(url) Then Exit For
  WScript.Sleep 500
Next

shell.Run url, 1, False

Function HttpOk(targetUrl)
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", targetUrl, False
  http.SetRequestHeader "Cache-Control", "no-cache"
  http.Send
  HttpOk = (Err.Number = 0 And http.Status >= 200 And http.Status < 500)
  Err.Clear
  On Error GoTo 0
End Function
