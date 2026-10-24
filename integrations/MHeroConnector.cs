// Unity example. Add one persistent instance, set ServerUrl/GameKey locally,
// subscribe to MatchReady, and call SubmitScores when the round ends.
// Engine-specific scene, HUD and gameplay wiring remains the game developer's responsibility.
using System;
using System.Collections;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public class MHeroConnector : MonoBehaviour
{
    public string ServerUrl = "http://192.168.1.100:3000";
    [Tooltip("Station-specific secret from the admin panel. Do not commit real keys.")]
    public string GameKey = "";
    public event Action<Match> MatchReady;
    public event Action MatchCancelled;
    public event Action ResultsSaved;
    public Match ActiveMatch { get; private set; }

    [Serializable] public class Player { public string id; public int slot; public string name; }
    [Serializable] public class Match { public string id; public string stationId; public string gameId; public string status; public Player[] players; }
    [Serializable] class Reply { public Match match; public string error; }
    [Serializable] public class Result { public string participantId; public double score; }
    [Serializable] class ResultBody { public Result[] results; }
    [Serializable] class Outbox { public string matchId; public ResultBody body; }
    Outbox pending;
    string candidateId;
    string outboxPath;
    bool ok;
    long status;
    string response;

    void Awake() { DontDestroyOnLoad(gameObject); outboxPath=Path.Combine(Application.persistentDataPath,"mhero-pending-score.json"); }
    IEnumerator Start()
    {
        // A score is persisted before transmission and retained through network/app restarts.
        if(File.Exists(outboxPath))
        {
            try { pending=JsonUtility.FromJson<Outbox>(File.ReadAllText(outboxPath)); }
            catch(Exception e) { Debug.LogError("MHERO: cannot read pending score: "+e.Message); enabled=false; }
        }
        while(enabled)
        {
            yield return Request("/poll","{}");
            if(ok)
            {
                var reply=JsonUtility.FromJson<Reply>(response);
                if(pending!=null)
                {
                    yield return Request("/matches/"+pending.matchId+"/results",JsonUtility.ToJson(pending.body));
                    if(ok) { ClearOutbox(); ActiveMatch=null; candidateId=null; ResultsSaved?.Invoke(); }
                    else if(status==409)
                    {
                        // Keep a forensic copy. Cancellation/conflicting scores require staff review.
                        Debug.LogError("MHERO result rejected: "+response);
                        File.Copy(outboxPath,outboxPath+".rejected-"+DateTime.UtcNow.Ticks,true);
                        ClearOutbox(); ActiveMatch=null; candidateId=null; MatchCancelled?.Invoke();
                    }
                }
                else if(reply.match==null)
                {
                    if(ActiveMatch!=null) MatchCancelled?.Invoke();
                    ActiveMatch=null; candidateId=null;
                }
                else if(ActiveMatch==null || ActiveMatch.id!=reply.match.id)
                {
                    if(ActiveMatch!=null) { MatchCancelled?.Invoke(); ActiveMatch=null; }
                    var incoming=reply.match;
                    if(incoming.status=="pending" || incoming.id==candidateId)
                    {
                        candidateId=incoming.id;
                        yield return Request("/matches/"+incoming.id+"/start","{}");
                        if(ok)
                        {
                            ActiveMatch=incoming;
                            // Wire this event to set HUD names and start exactly one round.
                            MatchReady?.Invoke(incoming);
                        }
                    }
                    else
                    {
                        // A running round from an earlier process cannot safely be restarted.
                        yield return Request("/matches/"+incoming.id+"/fail","{\"message\":\"Game restarted during the match. Please play again.\"}");
                    }
                }
            }
            yield return new WaitForSecondsRealtime(1f);
        }
    }

    public void SubmitScores(params double[] scores)
    {
        if(ActiveMatch==null || pending!=null) throw new InvalidOperationException("No active match, or a result is already pending.");
        if(scores.Length!=ActiveMatch.players.Length) throw new ArgumentException("Provide one score for each player in slot order.");
        var results=new Result[scores.Length];
        for(int i=0;i<scores.Length;i++)
        {
            if(double.IsNaN(scores[i]) || double.IsInfinity(scores[i]) || scores[i]<0 || scores[i]>1e12) throw new ArgumentException("Invalid score.");
            results[i]=new Result { participantId=ActiveMatch.players[i].id, score=scores[i] };
        }
        var outgoing=new Outbox { matchId=ActiveMatch.id, body=new ResultBody { results=results } };
        var temporary=outboxPath+".tmp";
        File.WriteAllText(temporary,JsonUtility.ToJson(outgoing));
        if(File.Exists(outboxPath)) File.Delete(outboxPath);
        File.Move(temporary,outboxPath);
        pending=outgoing;
    }

    void ClearOutbox() { if(File.Exists(outboxPath)) File.Delete(outboxPath); pending=null; }
    IEnumerator Request(string path,string json)
    {
        using(var req=new UnityWebRequest(ServerUrl.TrimEnd('/')+"/api/game"+path,"POST"))
        {
            req.uploadHandler=new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            req.downloadHandler=new DownloadHandlerBuffer(); req.timeout=5;
            req.SetRequestHeader("Content-Type","application/json");
            req.SetRequestHeader("Authorization","Bearer "+GameKey);
            yield return req.SendWebRequest();
            status=req.responseCode; ok=status>=200 && status<300;
            response=req.downloadHandler.text;
            if(!ok) Debug.LogWarning("MHERO request unavailable ("+status+"): "+req.error);
        }
    }
}
